INSERT IGNORE INTO ShippingMethod (id, name, kind, price, freeThreshold, country, enabled, createdAt, updatedAt) VALUES
('standard', 'Стандардна достава', 'STANDARD', 150, 3000, 'MK', true, NOW(3), NOW(3)),
('free', 'Бесплатна достава', 'FREE', 0, 3000, 'MK', true, NOW(3), NOW(3)),
('pickup', 'Лично подигнување', 'PICKUP', 0, NULL, 'MK', false, NOW(3), NOW(3));
