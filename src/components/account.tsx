'use client';
import { useState } from 'react';
import type { Copy } from '@/lib/i18n';
import { ApiForm } from './api-form';
export function LoginForm({ copy, admin = false }: { copy: Copy; admin?: boolean }) {
  const [register, setRegister] = useState(false);
  return (
    <div className="panel">
      <h2>{register ? copy.register : copy.login}</h2>
      <ApiForm
        endpoint={register ? '/api/auth/register' : '/api/auth/login'}
        submit={register ? copy.register : copy.login}
        redirect={admin ? '/admin' : '/account'}
        refresh
        transform={(data) => ({ ...data, admin })}
      >
        {register && (
          <label>
            {copy.name}
            <input name="name" autoComplete="name" required maxLength={150} />
          </label>
        )}
        <label>
          {copy.email}
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          {copy.password}
          <input
            name="password"
            type="password"
            minLength={register ? 12 : 1}
            maxLength={72}
            required
            autoComplete={register ? 'new-password' : 'current-password'}
          />
        </label>
        {register && <p className="form-note">12+ characters · max. 72 UTF-8 bytes</p>}
      </ApiForm>
      {!admin && (
        <button className="text-link centered" onClick={() => setRegister(!register)}>
          {register ? copy.login : copy.register}
        </button>
      )}
    </div>
  );
}
