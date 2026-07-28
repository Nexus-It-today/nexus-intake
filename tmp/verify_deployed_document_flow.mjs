import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

function parseEnv(text) {
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

const env = parseEnv(await fs.readFile('/tmp/vercel-prod.env', 'utf8'));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const now = Date.now();
const passwords = { shared: 'NexusTest123A' };
const fixtures = {
  admin: { email: `adminflow${now}@gmail.com`, companyId: randomUUID(), companyName: `Admin Flow ${now}` },
  merchantA: { email: `merchanta${now}@gmail.com`, companyId: randomUUID(), companyName: `Merchant Alpha ${now}` },
  merchantB: { email: `merchantb${now}@gmail.com`, companyId: randomUUID(), companyName: `Merchant Beta ${now}` },
};
const refs = {
  invalidA: `A-REVIEW-${now}`,
  validA: `A-VALID-${now}`,
  validB: `B-VALID-${now}`,
};

const report = {
  smoke: {
    adminSeesAllMerchantsOrders: { pass: false, detail: '' },
    merchantSeesOnlyOwnData: { pass: false, detail: '' },
    merchantCanCreateOrder: { pass: false, detail: '' },
    missingDataGoesToReviewNotTrackPod: { pass: false, detail: '' },
    reviewOrderCanBeEditedAndResubmitted: { pass: false, detail: '' },
    validOrderGoesToTrackPod: { pass: false, detail: '' },
    trackItShowsAcceptedOrderAndLinks: { pass: false, detail: '' },
    processItLinksBackToSourceOrder: { pass: false, detail: '' },
    noMerchantDataLeakage: { pass: false, detail: '' },
  },
  ids: {},
  errors: [],
};

const createdUserIds = [];
const createdCompanyIds = [];
const createdOrderIds = [];
let browser;

function buildOrder({ ref, merchantName, customerName, valid }) {
  return {
    orderReference: ref,
    jobReference: '',
    externalOrderId: `EXT-${ref}`,
    sourceSystem: 'merchant_portal',
    collectionMode: 'new_address',
    salesChannel: 'Portal',
    merchant: merchantName,
    customer: customerName,
    status: 'pending_review',
    priority: 'Normal',
    notes: valid ? 'Valid smoke order' : 'Needs review smoke order',
    collection: {
      company: `${merchantName} Hub`,
      contact: 'Ops Desk',
      addressLine1: '1 Collection Street',
      addressLine2: '',
      addressLine3: '',
      postcode: 'BT1 1AA',
      country: 'UK',
      phone: '+441234567890',
      email: 'collection@example.com',
      date: '2026-07-06',
      time: '',
      instructions: '',
      latitude: '',
      longitude: '',
    },
    delivery: {
      company: customerName,
      contact: 'Receiving Team',
      addressLine1: '2 Delivery Road',
      addressLine2: '',
      addressLine3: '',
      postcode: valid ? 'BT2 2BB' : '',
      country: 'UK',
      phone: valid ? '+441234567891' : '',
      email: valid ? 'delivery@example.com' : '',
      date: '2026-07-07',
      time: '',
      instructions: '',
      latitude: '',
      longitude: '',
    },
    goods: [
      {
        description: valid ? '12 boxed parcels' : 'Review parcels',
        productCode: '',
        quantity: valid ? 12 : 0,
        packages: valid ? 12 : 0,
        palletCount: 1,
        weightKg: valid ? 120 : 0,
        dimensions: valid ? '120x80x100' : '',
        fragile: false,
        twoMan: false,
        roomOfChoice: false,
        assembly: false,
        photosRequired: false,
        tailLiftRequired: false,
        dedicatedVehicle: false,
        northernIrelandDelivery: false,
        sameDay: false,
        catalogueItemId: '',
        itemType: 'product',
        unitPrice: 0,
        vatRate: 0,
        lineTotal: 0,
      },
    ],
    commercial: {
      purchaseOrder: '',
      net: '',
      vat: '',
      total: '',
      cod: '',
      invoiceRequired: false,
    },
    operations: {
      depot: '',
      warehouse: '',
      route: '',
      shipper: `${merchantName} Hub`,
      serviceType: '',
      readyForTrackPod: true,
      adminReleaseOverride: false,
      distanceKm: '',
      journeyMinutes: '',
    },
  };
}

async function createUserWithProfile({ email, companyId, companyName, role }) {
  const created = await admin.auth.admin.createUser({
    email,
    password: passwords.shared,
    email_confirm: true,
    user_metadata: {
      company_id: companyId,
      company_name: companyName,
      business_type: 'courier',
      contact_name: role,
      contact_phone: '+447700900123',
    },
  });
  if (created.error || !created.data.user) throw new Error(created.error?.message ?? `createUser failed for ${email}`);
  const userId = created.data.user.id;
  createdUserIds.push(userId);

  const companyRes = await admin.from('companies').insert({ id: companyId, name: companyName, business_type: 'courier' });
  if (companyRes.error) throw new Error(`company insert failed for ${companyName}: ${companyRes.error.message}`);
  createdCompanyIds.push(companyId);

  const profileRes = await admin.from('profiles').insert({ auth_user_id: userId, company_id: companyId, role });
  if (profileRes.error) throw new Error(`profile insert failed for ${email}: ${profileRes.error.message}`);
  return userId;
}

async function login(context, email, password) {
  const page = await context.newPage();
  await page.goto('https://nexusit.today/signin', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(7000);
  const alert = (await page.locator('[role="alert"]').first().textContent().catch(() => ''))?.trim() || '';
  return { page, alert, url: page.url() };
}

async function browserApi(page, path, init = {}) {
  return page.evaluate(async ({ path, init }) => {
    const key = Object.keys(localStorage).find((candidate) => candidate.includes('auth-token'));
    const raw = key ? localStorage.getItem(key) : null;
    const token = raw ? JSON.parse(raw).access_token ?? null : null;
    const response = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return { status: response.status, ok: response.ok, text, json };
  }, { path, init });
}

async function createMerchantOrder(page, order) {
  return browserApi(page, '/api/intake/orders', {
    method: 'POST',
    body: JSON.stringify({ order }),
  });
}

async function findJobByReference(companyId, jobReference) {
  const res = await admin.from('draft_jobs').select('id, job_reference, lifecycle_status, current_status, trackpod_collection_tracking_url, trackpod_delivery_tracking_url, trackpod_collection_order_id, trackpod_delivery_order_id').eq('company_id', companyId).eq('job_reference', jobReference).maybeSingle();
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

try {
  const adminUserId = await createUserWithProfile({ ...fixtures.admin, role: 'super_admin' });
  const merchantAUserId = await createUserWithProfile({ ...fixtures.merchantA, role: 'company_admin' });
  const merchantBUserId = await createUserWithProfile({ ...fixtures.merchantB, role: 'company_admin' });
  report.ids = { adminUserId, merchantAUserId, merchantBUserId };

  browser = await chromium.launch({ headless: true });

  // Merchant A creates two orders.
  const merchantAContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const merchantALogin = await login(merchantAContext, fixtures.merchantA.email, passwords.shared);
  if (merchantALogin.alert) throw new Error(`merchant A signin failed: ${merchantALogin.alert}`);
  const createInvalid = await createMerchantOrder(merchantALogin.page, buildOrder({ ref: refs.invalidA, merchantName: fixtures.merchantA.companyName, customerName: 'Customer Review A', valid: false }));
  const createValid = await createMerchantOrder(merchantALogin.page, buildOrder({ ref: refs.validA, merchantName: fixtures.merchantA.companyName, customerName: 'Customer Valid A', valid: true }));
  if (createInvalid.ok && createValid.ok) {
    report.smoke.merchantCanCreateOrder = { pass: true, detail: 'Merchant A created review and valid orders through /api/intake/orders.' };
  } else {
    report.smoke.merchantCanCreateOrder = { pass: false, detail: `Invalid create=${createInvalid.status} valid create=${createValid.status}` };
  }

  // Merchant B creates one order.
  const merchantBContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const merchantBLogin = await login(merchantBContext, fixtures.merchantB.email, passwords.shared);
  if (merchantBLogin.alert) throw new Error(`merchant B signin failed: ${merchantBLogin.alert}`);
  const createB = await createMerchantOrder(merchantBLogin.page, buildOrder({ ref: refs.validB, merchantName: fixtures.merchantB.companyName, customerName: 'Customer Valid B', valid: true }));
  if (!createB.ok) report.errors.push(`Merchant B create failed ${createB.status}: ${createB.text}`);

  const invalidJob = await findJobByReference(fixtures.merchantA.companyId, refs.invalidA);
  const validJob = await findJobByReference(fixtures.merchantA.companyId, refs.validA);
  const validBJob = await findJobByReference(fixtures.merchantB.companyId, refs.validB);
  if (invalidJob?.id) createdOrderIds.push(invalidJob.id);
  if (validJob?.id) createdOrderIds.push(validJob.id);
  if (validBJob?.id) createdOrderIds.push(validBJob.id);

  // Merchant isolation on orders page.
  await merchantALogin.page.goto('https://nexusit.today/portal/orders', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await merchantALogin.page.waitForTimeout(5000);
  const merchantAText = await merchantALogin.page.locator('body').innerText();
  await merchantBLogin.page.goto('https://nexusit.today/portal/orders', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await merchantBLogin.page.waitForTimeout(5000);
  const merchantBText = await merchantBLogin.page.locator('body').innerText();

  const aOnly = merchantAText.includes(refs.invalidA) && merchantAText.includes(refs.validA) && !merchantAText.includes(refs.validB);
  const bOnly = merchantBText.includes(refs.validB) && !merchantBText.includes(refs.invalidA) && !merchantBText.includes(refs.validA);
  report.smoke.merchantSeesOnlyOwnData = { pass: aOnly && bOnly, detail: `merchantA own=${aOnly} merchantB own=${bOnly}` };
  report.smoke.noMerchantDataLeakage = { pass: aOnly && bOnly, detail: `Merchant portals excluded cross-tenant refs.` };

  // Invalid order enters review when sent to process.
  const invalidSend = await browserApi(merchantALogin.page, `/api/orders/dashboard/${invalidJob.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'send_to_process' }),
  });
  const invalidAfterSend = await findJobByReference(fixtures.merchantA.companyId, refs.invalidA);
  report.smoke.missingDataGoesToReviewNotTrackPod = {
    pass: invalidSend.status === 409 && invalidAfterSend?.lifecycle_status === 'REVIEW_REQUIRED',
    detail: `status=${invalidSend.status} lifecycle=${invalidAfterSend?.lifecycle_status ?? 'missing'}`,
  };

  // Admin sees all merchants/orders and Process it links back.
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const adminLogin = await login(adminContext, fixtures.admin.email, passwords.shared);
  if (adminLogin.alert) throw new Error(`admin signin failed: ${adminLogin.alert}`);
  await adminLogin.page.goto('https://nexusit.today/orders', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await adminLogin.page.waitForTimeout(5000);
  const adminOrdersText = await adminLogin.page.locator('body').innerText();
  const adminSeesAll = adminOrdersText.includes(refs.invalidA) && adminOrdersText.includes(refs.validA) && adminOrdersText.includes(refs.validB) && adminOrdersText.includes(fixtures.merchantA.companyName) && adminOrdersText.includes(fixtures.merchantB.companyName);
  report.smoke.adminSeesAllMerchantsOrders = { pass: adminSeesAll, detail: 'Admin orders board visibility checked across both merchants.' };

  await adminLogin.page.goto('https://nexusit.today/process-it', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await adminLogin.page.waitForTimeout(5000);
  const editSourceButton = adminLogin.page.getByRole('button', { name: 'Edit Source' }).first();
  let processLinkOk = false;
  if (await editSourceButton.count()) {
    await editSourceButton.click();
    await adminLogin.page.waitForTimeout(4000);
    const currentUrl = adminLogin.page.url();
    processLinkOk = currentUrl.includes('/orders?orderId=') && currentUrl.includes('edit=1');
  }
  report.smoke.processItLinksBackToSourceOrder = { pass: processLinkOk, detail: processLinkOk ? 'Process it Edit Source navigated to orders deep link.' : 'Edit Source link did not navigate as expected.' };

  // Merchant edits invalid order and resubmits.
  const merchantFix = await browserApi(merchantALogin.page, `/api/orders/dashboard/${invalidJob.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      deliveryPostcode: 'BT3 3CC',
      deliveryPhone: '+441234567892',
      deliveryEmail: 'reviewfixed@example.com',
      goodsDescription: 'Corrected parcels',
      quantity: '5',
      packageType: 'Pallet',
      volume: '2.5',
      weightKg: '80',
    }),
  });
  const merchantResubmit = await browserApi(merchantALogin.page, `/api/orders/dashboard/${invalidJob.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'send_to_process' }),
  });
  const invalidAfterFix = await findJobByReference(fixtures.merchantA.companyId, refs.invalidA);
  report.smoke.reviewOrderCanBeEditedAndResubmitted = {
    pass: merchantFix.ok && merchantResubmit.ok && invalidAfterFix?.lifecycle_status === 'READY_FOR_TRACKPOD',
    detail: `edit=${merchantFix.status} resubmit=${merchantResubmit.status} lifecycle=${invalidAfterFix?.lifecycle_status ?? 'missing'}`,
  };

  // Make valid order explicitly ready via edit endpoint, then send through Track-POD collection + delivery.
  const validPrep = await browserApi(merchantALogin.page, `/api/orders/dashboard/${validJob.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ packageType: 'Pallet', volume: '3.2', weightKg: '120', quantity: '12' }),
  });
  const validQueue = await browserApi(merchantALogin.page, `/api/orders/dashboard/${validJob.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'send_to_process' }),
  });
  const sendCollection = await browserApi(adminLogin.page, '/api/process-it/send', {
    method: 'POST',
    body: JSON.stringify({ draftJobId: validJob.id, releaseMode: 'collection' }),
  });
  const confirmCollection = await browserApi(adminLogin.page, '/api/process-it/confirm-collection', {
    method: 'POST',
    body: JSON.stringify({ draftJobId: validJob.id }),
  });
  const sendDelivery = await browserApi(adminLogin.page, '/api/process-it/send', {
    method: 'POST',
    body: JSON.stringify({ draftJobId: validJob.id, releaseMode: 'delivery' }),
  });
  const validAfterTrackPod = await findJobByReference(fixtures.merchantA.companyId, refs.validA);
  const trackpodSuccess = sendCollection.ok && confirmCollection.ok && sendDelivery.ok && Boolean(validAfterTrackPod?.trackpod_collection_tracking_url || validAfterTrackPod?.trackpod_delivery_tracking_url);
  report.smoke.validOrderGoesToTrackPod = {
    pass: trackpodSuccess,
    detail: `prep=${validPrep.status} queue=${validQueue.status} collection=${sendCollection.status} confirm=${confirmCollection.status} delivery=${sendDelivery.status}`,
  };

  // Merchant Track it shows accepted order and links.
  await merchantALogin.page.goto('https://nexusit.today/portal/track-it', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await merchantALogin.page.waitForTimeout(5000);
  const trackText = await merchantALogin.page.locator('body').innerText();
  const trackHasOrder = trackText.includes(refs.validA);
  const trackHasProvisionalWarning = trackText.includes('Routes shown here are provisional.');
  const trackHasLinks = await merchantALogin.page.locator('a', { hasText: 'Open' }).count().catch(() => 0);
  report.smoke.trackItShowsAcceptedOrderAndLinks = {
    pass: trackHasOrder && trackHasProvisionalWarning && trackHasLinks > 0,
    detail: `order=${trackHasOrder} warning=${trackHasProvisionalWarning} links=${trackHasLinks}`,
  };
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error));
} finally {
  try {
    if (createdOrderIds.length > 0) await admin.from('draft_jobs').delete().in('id', createdOrderIds);
    for (const userId of createdUserIds) {
      await admin.from('profiles').delete().eq('auth_user_id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
    for (const companyId of createdCompanyIds) {
      await admin.from('companies').delete().eq('id', companyId);
    }
  } catch (cleanupError) {
    report.errors.push(cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
  }
  try { await browser?.close(); } catch {}
}

console.log(JSON.stringify(report, null, 2));
