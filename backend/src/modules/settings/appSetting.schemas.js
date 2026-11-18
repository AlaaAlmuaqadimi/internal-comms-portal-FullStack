import { z } from 'zod';

// Accept either a flat map of keys or `{ settings: { ... } }`. The service
// validates which keys are editable and that values are non-empty strings.
export const updateAppSettingsSchema = z.record(
  z.string().trim().min(1, 'Setting key is required.'),
  z.string().trim().min(1, 'Setting value must not be empty.')
);
