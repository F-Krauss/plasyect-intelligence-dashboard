#!/usr/bin/env node
import crypto from 'node:crypto';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const organizationSlug = process.env.SUPABASE_ORG_SLUG;
const dbPass = process.env.SUPABASE_DB_PASSWORD;
const name = process.env.SUPABASE_PROJECT_NAME || 'dashboard-plasyect';
const region = process.env.SUPABASE_REGION || 'us-east-2';

if (!token || !organizationSlug || !dbPass) {
  console.error('Missing SUPABASE_ACCESS_TOKEN, SUPABASE_ORG_SLUG, or SUPABASE_DB_PASSWORD.');
  process.exit(1);
}

const idempotencyKey = process.env.SUPABASE_IDEMPOTENCY_KEY || crypto.randomUUID();
const response = await fetch('https://api.supabase.com/v1/projects', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey
  },
  body: JSON.stringify({
    name,
    organization_slug: organizationSlug,
    db_pass: dbPass,
    region,
    region_selection: { type: 'specific', region }
  })
});

const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ...body, idempotencyKey }, null, 2));
