import test from 'node:test';
import assert from 'node:assert/strict';
import { redactChatText, requestAssistantReply } from '../src/lib/chat-ai-client';

const config = {
  apiKey: 'test-only-key-not-a-real-secret',
  model: 'gpt-4.1-mini',
  context: 'Published product: Blue vase. Price: 500 MKD. Shipping: 150–210 MKD.',
  messages: [{ sender: 'VISITOR' as const, text: 'Колку чини сината вазна?' }],
};

function modelResponse(reply: unknown, status = 'completed') {
  return Response.json({
    status,
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(reply) }],
      },
    ],
  });
}

test('AI request stays server-side, disables response storage and bounds output', async () => {
  let sentUrl = '';
  let sentInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (url, init) => {
    sentUrl = String(url);
    sentInit = init;
    return modelResponse({ reply: 'Сината вазна чини 500 денари.', handoff: false });
  };
  const reply = await requestAssistantReply(config, fetcher);
  assert.deepEqual(reply, { text: 'Сината вазна чини 500 денари.', handoff: false });
  assert.equal(sentUrl, 'https://api.openai.com/v1/responses');
  assert.equal(sentInit?.method, 'POST');
  assert.equal(new Headers(sentInit?.headers).get('authorization'), `Bearer ${config.apiKey}`);
  assert.ok(sentInit?.signal instanceof AbortSignal);
  const body = JSON.parse(String(sentInit?.body));
  assert.equal(body.store, false);
  assert.equal(body.model, config.model);
  assert.ok(body.max_output_tokens > 0 && body.max_output_tokens <= 1000);
  assert.equal(body.tools, undefined);
  assert.equal(body.previous_response_id, undefined);
  assert.equal(String(sentInit?.body).includes(config.apiKey), false);
});

test('structured handoff survives parsing without being presented as a human response', async () => {
  const reply = await requestAssistantReply(config, async () =>
    modelResponse({
      reply: 'За промена на нарачката ќе помогне тимот на студиото.',
      handoff: true,
    }),
  );
  assert.equal(reply.handoff, true);
  assert.match(reply.text, /тимот/);
});

test('missing credentials do not send any request to OpenAI', async () => {
  let calls = 0;
  await assert.rejects(
    requestAssistantReply({ ...config, apiKey: '' }, async () => {
      calls++;
      return modelResponse({ reply: 'Should never send.', handoff: false });
    }),
  );
  assert.equal(calls, 0);
});

test('API failures are not retried and do not expose provider error contents', async () => {
  let calls = 0;
  await assert.rejects(
    requestAssistantReply(config, async () => {
      calls++;
      return Response.json(
        { error: { message: `Sensitive diagnostics ${config.apiKey}` } },
        { status: 429 },
      );
    }),
    (error: Error) => {
      assert.equal(error.message.includes(config.apiKey), false);
      assert.equal(error.message.includes('Sensitive diagnostics'), false);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test('refusals, incomplete answers, malformed JSON and invalid schemas fail closed', async () => {
  const responses = [
    {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No answer.' }] }],
    },
    {
      status: 'incomplete',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: '{"reply":"partial","handoff":false}' }],
        },
      ],
    },
    {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'not JSON' }] }],
    },
    { status: 'completed', output: [] },
  ];
  for (const response of responses) {
    await assert.rejects(requestAssistantReply(config, async () => Response.json(response)));
  }
  for (const invalid of [
    { reply: '', handoff: false },
    { reply: '   ', handoff: false },
    { reply: 'A reply', handoff: 'false' },
    { reply: 'A reply' },
  ])
    await assert.rejects(requestAssistantReply(config, async () => modelResponse(invalid)));
});

test('contact redaction protects common Macedonian phone formats and email addresses', () => {
  const privateText = 'Пишете на ana@example.com или +389 70 123 456, 070-123-456.';
  const redacted = redactChatText(privateText);
  assert.equal(redacted.includes('ana@example.com'), false);
  assert.equal(redacted.includes('389 70 123 456'), false);
  assert.equal(redacted.includes('070-123-456'), false);
  assert.equal(
    redactChatText('Цената е 200 денари, достава 150–210 денари и рок 1–3 дена.'),
    'Цената е 200 денари, достава 150–210 денари и рок 1–3 дена.',
  );
});

test('chat text is redacted before transmission, not merely when displayed', async () => {
  let requestBody = '';
  await requestAssistantReply(
    {
      ...config,
      messages: [
        { sender: 'VISITOR', text: 'Contact ana@example.com or +389 70 123 456.' },
        { sender: 'ADMIN', text: 'We received ana@example.com.' },
        { sender: 'AI', text: 'How can I help?' },
      ],
    },
    async (_url, init) => {
      requestBody = String(init?.body);
      return modelResponse({ reply: 'Ќе помогнеме.', handoff: false });
    },
  );
  assert.equal(requestBody.includes('ana@example.com'), false);
  assert.equal(requestBody.includes('389 70 123 456'), false);
});
