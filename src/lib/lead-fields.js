/**
 * Lead field definitions shared by the bulk-upload template, the upload parser and the export.
 * Everything here is language-aware so a Russian project gets a fully Russian spreadsheet
 * (headers, sample row, field guide) and Russian cell values are mapped back to the
 * machine values the database uses.
 */

const LEAD_FIELDS = [
  'company_name', 'email', 'phone', 'city', 'domain', 'sector',
  'company_size', 'decision_maker_title', 'contact_person',
  'pain_point', 'notes', 'source_url', 'priority', 'status',
];

const VALID_STATUSES = ['not_contacted','touch_1','touch_2','touch_3','email_sent','call_made','replied','meeting_booked','proposal_sent','negotiating','contract_signed','not_interested','follow_up_later'];
const VALID_PRIORITIES = ['HOT','HIGH','MEDIUM','PARTNER'];

// Column headers written into the downloadable template, per language
const HEADERS = {
  en: {
    company_name: 'company_name', email: 'email', phone: 'phone', city: 'city', domain: 'domain', sector: 'sector',
    company_size: 'company_size', decision_maker_title: 'decision_maker_title', contact_person: 'contact_person',
    pain_point: 'pain_point', notes: 'notes', source_url: 'source_url', priority: 'priority', status: 'status',
  },
  ru: {
    company_name: 'Название компании', email: 'Email', phone: 'Телефон', city: 'Город', domain: 'Сайт (домен)', sector: 'Отрасль',
    company_size: 'Размер компании', decision_maker_title: 'Должность ЛПР', contact_person: 'Контактное лицо',
    pain_point: 'Потребность / боль', notes: 'Заметки', source_url: 'Источник (URL)', priority: 'Приоритет', status: 'Статус',
  },
};

// Human labels for machine values, per language
const SECTOR_LABELS = {
  en: { construction: 'Construction', manufacturing: 'Manufacturing', warehouse_logistics: 'Warehouse/Logistics', food_processing: 'Food Processing', metallurgy: 'Metallurgy', mining: 'Mining', chemicals: 'Chemicals', automotive: 'Automotive', hospitality: 'Hospitality', retail: 'Retail', healthcare: 'Healthcare', education: 'Education', it_tech: 'IT & Technology', real_estate: 'Real Estate', oil_gas: 'Oil & Gas', logistics: 'Logistics', cleaning_maintenance: 'Cleaning & Facility Mgmt', trading: 'Trading', security: 'Security', agency_partner: 'Agency Partner', industry_association: 'Industry Association', general: 'General', other: 'Other' },
  ru: { construction: 'Строительство', manufacturing: 'Производство', warehouse_logistics: 'Склад и логистика', food_processing: 'Пищевая промышленность', metallurgy: 'Металлургия', mining: 'Добыча', chemicals: 'Химия и нефть', automotive: 'Автопром', hospitality: 'Гостиничный бизнес', retail: 'Розница', healthcare: 'Здравоохранение', education: 'Образование', it_tech: 'IT и технологии', real_estate: 'Недвижимость', oil_gas: 'Нефть и газ', logistics: 'Логистика', cleaning_maintenance: 'Клининг и обслуживание', trading: 'Торговля', security: 'Охрана', agency_partner: 'Агентство-партнёр', industry_association: 'Отраслевая ассоциация', general: 'Общее', other: 'Другое' },
};
const PRIORITY_LABELS = {
  en: { HOT: 'HOT', HIGH: 'HIGH', MEDIUM: 'MEDIUM', PARTNER: 'PARTNER' },
  ru: { HOT: 'Горячий', HIGH: 'Высокий', MEDIUM: 'Средний', PARTNER: 'Партнёр' },
};
const STATUS_LABELS = {
  en: { not_contacted: 'Not Contacted', touch_1: 'Touch 1', touch_2: 'Touch 2', touch_3: 'Touch 3', email_sent: 'Email Sent', call_made: 'Call Made', replied: 'Replied', meeting_booked: 'Meeting Booked', proposal_sent: 'Proposal Sent', negotiating: 'Negotiating', contract_signed: 'Contract Signed', not_interested: 'Not Interested', follow_up_later: 'Follow Up Later' },
  ru: { not_contacted: 'Не связывались', touch_1: 'Касание 1', touch_2: 'Касание 2', touch_3: 'Касание 3', email_sent: 'Письмо отправлено', call_made: 'Звонок сделан', replied: 'Ответили', meeting_booked: 'Встреча назначена', proposal_sent: 'КП отправлено', negotiating: 'Переговоры', contract_signed: 'Договор подписан', not_interested: 'Не заинтересованы', follow_up_later: 'Связаться позже' },
};

// Sample row for the template, per language
const SAMPLE_ROW = {
  en: {
    company_name: 'Acme Construction LLC', email: 'info@acmeconstruction.ae', phone: '+971501234567', city: 'Dubai',
    domain: 'acmeconstruction.ae', sector: 'construction', company_size: '50-100', decision_maker_title: 'General Manager',
    contact_person: 'Ahmed Al Maktoum', pain_point: 'Needs skilled construction workers', notes: 'Met at Big 5 exhibition',
    source_url: 'https://acmeconstruction.ae', priority: 'HIGH', status: 'not_contacted',
  },
  ru: {
    company_name: 'ООО «СтройИнвест»', email: 'info@stroyinvest.ru', phone: '+7 495 123-45-67', city: 'Москва',
    domain: 'stroyinvest.ru', sector: 'Строительство', company_size: '50-100', decision_maker_title: 'Генеральный директор',
    contact_person: 'Иван Петров', pain_point: 'Нужны квалифицированные строители на объект', notes: 'Познакомились на выставке',
    source_url: 'https://stroyinvest.ru', priority: 'Высокий', status: 'Не связывались',
  },
};

// Field guide sheet, per language
function fieldGuide(lang) {
  const L = lang === 'ru' ? 'ru' : 'en';
  const list = (m) => Object.values(m[L]).join(', ');
  if (L === 'ru') return {
    sheet: 'Справочник полей',
    rows: [
      ['Поле', 'Обязательно', 'Описание', 'Допустимые значения'],
      [HEADERS.ru.company_name, 'ДА', 'Название компании или организации', 'Любой текст (2–120 символов)'],
      [HEADERS.ru.email, 'Нет', 'Контактный email', 'Корректный адрес email'],
      [HEADERS.ru.phone, 'Нет', 'Телефон с кодом страны', '+7 495 123-45-67'],
      [HEADERS.ru.city, 'Нет', 'Город компании', 'Москва, Санкт-Петербург и т.д.'],
      [HEADERS.ru.domain, 'Нет', 'Домен сайта компании', 'example.ru'],
      [HEADERS.ru.sector, 'Нет', 'Отрасль', list(SECTOR_LABELS)],
      [HEADERS.ru.company_size, 'Нет', 'Примерный размер компании', '10-50, 50-100, 100-500, 500+'],
      [HEADERS.ru.decision_maker_title, 'Нет', 'Должность лица, принимающего решения', 'Генеральный директор, Директор по персоналу и т.д.'],
      [HEADERS.ru.contact_person, 'Нет', 'Имя контактного лица', 'Имя и фамилия'],
      [HEADERS.ru.pain_point, 'Нет', 'Потребность бизнеса', 'Свободный текст'],
      [HEADERS.ru.notes, 'Нет', 'Дополнительные заметки', 'Свободный текст'],
      [HEADERS.ru.source_url, 'Нет', 'Где найден лид', 'https://...'],
      [HEADERS.ru.priority, 'Нет', 'Приоритет лида', list(PRIORITY_LABELS) + ' (или HOT, HIGH, MEDIUM, PARTNER)'],
      [HEADERS.ru.status, 'Нет', 'Статус лида', list(STATUS_LABELS)],
      [],
      ['Подсказка', '', 'Первая строка листа «Лиды» — пример. Удалите её перед загрузкой или оставьте: система пометит её как дубликат, если такая компания уже есть.', ''],
    ],
    widths: [{ wch: 24 }, { wch: 12 }, { wch: 46 }, { wch: 70 }],
  };
  return {
    sheet: 'Field Guide',
    rows: [
      ['Field', 'Required', 'Description', 'Valid Values'],
      ['company_name', 'YES', 'Company or organization name', 'Any text (2-120 chars)'],
      ['email', 'No', 'Contact email address', 'Valid email format'],
      ['phone', 'No', 'Phone number with country code', '+971501234567'],
      ['city', 'No', 'City where company is located', 'Dubai, Riyadh, etc.'],
      ['domain', 'No', 'Company website domain', 'example.com'],
      ['sector', 'No', 'Industry sector', Object.keys(SECTOR_LABELS.en).join(', ')],
      ['company_size', 'No', 'Approximate company size', '10-50, 50-100, 100-500, 500+'],
      ['decision_maker_title', 'No', 'Title of decision maker', 'CEO, General Manager, HR Director, etc.'],
      ['contact_person', 'No', 'Name of contact person', 'Full name'],
      ['pain_point', 'No', 'Business pain point or need', 'Free text'],
      ['notes', 'No', 'Additional notes', 'Free text'],
      ['source_url', 'No', 'URL where lead was found', 'https://...'],
      ['priority', 'No', 'Lead priority level', VALID_PRIORITIES.join(', ')],
      ['status', 'No', 'Lead status', VALID_STATUSES.join(', ')],
    ],
    widths: [{ wch: 24 }, { wch: 10 }, { wch: 40 }, { wch: 60 }],
  };
}

// ─── Header → field aliases (both languages, case-insensitive) ────────────
const COLUMN_ALIASES = {
  company_name: ['company_name', 'company', 'company name', 'organization', 'org', 'business', 'business name', 'name',
    'название компании', 'компания', 'название', 'организация', 'наименование', 'наименование компании', 'фирма'],
  email: ['email', 'email address', 'e-mail', 'mail', 'contact email', 'эл. почта', 'электронная почта', 'почта', 'емейл', 'имейл', 'e-mail адрес'],
  phone: ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'contact phone', 'cell', 'телефон', 'тел', 'тел.', 'номер телефона', 'мобильный'],
  city: ['city', 'location', 'town', 'area', 'город', 'населённый пункт', 'населенный пункт', 'регион', 'город/регион'],
  domain: ['domain', 'website domain', 'web domain', 'домен', 'сайт', 'сайт (домен)', 'веб-сайт', 'website'],
  sector: ['sector', 'industry', 'type', 'category', 'business type', 'отрасль', 'сектор', 'индустрия', 'сфера', 'категория', 'вид деятельности'],
  company_size: ['company_size', 'company size', 'size', 'employees', 'staff', 'headcount', 'размер компании', 'размер', 'численность', 'сотрудники', 'штат'],
  decision_maker_title: ['decision_maker_title', 'decision maker title', 'title', 'position', 'job title', 'designation', 'должность лпр', 'должность', 'лпр', 'позиция', 'должность контакта'],
  contact_person: ['contact_person', 'contact person', 'contact name', 'contact', 'person', 'poc', 'point of contact', 'контактное лицо', 'контакт', 'имя контакта', 'фио', 'ф.и.о.', 'контактное лицо (фио)'],
  pain_point: ['pain_point', 'pain point', 'need', 'requirement', 'challenge', 'потребность / боль', 'потребность', 'боль', 'проблема', 'запрос', 'потребности'],
  notes: ['notes', 'note', 'remarks', 'comments', 'description', 'заметки', 'примечание', 'примечания', 'комментарий', 'комментарии', 'описание'],
  source_url: ['source_url', 'source url', 'source', 'url', 'link', 'источник (url)', 'источник', 'ссылка', 'url источника'],
  priority: ['priority', 'lead priority', 'importance', 'приоритет', 'важность'],
  status: ['status', 'lead status', 'stage', 'state', 'статус', 'этап', 'стадия'],
};

function autoMapColumns(headers) {
  const mapping = {};
  const used = new Set();
  for (const header of headers) {
    const h = String(header).toLowerCase().trim();
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (used.has(field)) continue;
      if (aliases.includes(h)) { mapping[header] = field; used.add(field); break; }
    }
  }
  return mapping;
}

// ─── Value normalisation: Russian (or English) labels → machine values ───
function invert(labels) {
  const out = {};
  for (const L of Object.keys(labels)) for (const [k, v] of Object.entries(labels[L])) out[String(v).toLowerCase()] = k;
  return out;
}
const SECTOR_BY_LABEL = invert(SECTOR_LABELS);
const PRIORITY_BY_LABEL = invert(PRIORITY_LABELS);
const STATUS_BY_LABEL = invert(STATUS_LABELS);
// Extra spellings people actually type
Object.assign(SECTOR_BY_LABEL, { 'логистика и склад': 'warehouse_logistics', 'склад': 'warehouse_logistics', 'пищевка': 'food_processing', 'пищевое производство': 'food_processing', 'химическая промышленность': 'chemicals', 'нефтехимия': 'chemicals', 'авто': 'automotive', 'отели': 'hospitality', 'ресторан': 'hospitality', 'ритейл': 'retail', 'торговля': 'retail', 'прочее': 'other', 'другая': 'other' });
Object.assign(PRIORITY_BY_LABEL, { 'горячий': 'HOT', 'горячо': 'HOT', 'высокий': 'HIGH', 'средний': 'MEDIUM', 'партнер': 'PARTNER', 'партнёр': 'PARTNER', 'hot': 'HOT', 'high': 'HIGH', 'medium': 'MEDIUM', 'partner': 'PARTNER' });
Object.assign(STATUS_BY_LABEL, { 'не связывались': 'not_contacted', 'не контактировали': 'not_contacted', 'новый': 'not_contacted', 'новые': 'not_contacted', 'письмо': 'email_sent', 'email отправлен': 'email_sent', 'звонок': 'call_made', 'ответ': 'replied', 'ответил': 'replied', 'встреча': 'meeting_booked', 'предложение отправлено': 'proposal_sent', 'кп': 'proposal_sent', 'договор': 'contract_signed', 'подписан': 'contract_signed', 'отказ': 'not_interested', 'не интересно': 'not_interested', 'позже': 'follow_up_later', 'напомнить': 'follow_up_later' });

function normalizeLeadValues(lead) {
  const out = { ...lead };
  if (out.sector) {
    const key = String(out.sector).trim().toLowerCase();
    out.sector = SECTOR_BY_LABEL[key] || (SECTOR_LABELS.en[key] ? key : key.replace(/\s+/g, '_'));
  }
  if (out.priority) {
    const key = String(out.priority).trim().toLowerCase();
    out.priority = PRIORITY_BY_LABEL[key] || String(out.priority).trim().toUpperCase();
  }
  if (out.status) {
    const key = String(out.status).trim().toLowerCase();
    out.status = STATUS_BY_LABEL[key] || key.replace(/\s+/g, '_');
  }
  return out;
}

// ─── Validation messages, per language ───────────────────────────────────
const MSG = {
  en: {
    company_required: 'Company name is required (min 2 chars)',
    company_long: 'Company name too long (max 120 chars)',
    email_invalid: 'Invalid email format',
    phone_invalid: 'Invalid phone format (use +country digits)',
    priority_invalid: (v) => `Invalid priority. Use: ${v}`,
    status_invalid: (v) => `Invalid status. Use: ${v}`,
    duplicate: 'Duplicate — already exists in leads',
  },
  ru: {
    company_required: 'Укажите название компании (минимум 2 символа)',
    company_long: 'Слишком длинное название (максимум 120 символов)',
    email_invalid: 'Некорректный формат email',
    phone_invalid: 'Некорректный телефон (используйте +код страны и цифры)',
    priority_invalid: (v) => `Неверный приоритет. Допустимо: ${v}`,
    status_invalid: (v) => `Неверный статус. Допустимо: ${v}`,
    duplicate: 'Дубликат — такая компания уже есть в базе',
  },
};

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_RE = /^[+\d\s\-()]{6,20}$/;

function validateRow(row, lang = 'en') {
  const L = lang === 'ru' ? 'ru' : 'en';
  const m = MSG[L];
  const errors = [];
  if (!row.company_name || String(row.company_name).trim().length < 2) errors.push({ field: 'company_name', msg: m.company_required });
  if (row.company_name && String(row.company_name).length > 120) errors.push({ field: 'company_name', msg: m.company_long });
  if (row.email && !EMAIL_RE.test(String(row.email).trim())) errors.push({ field: 'email', msg: m.email_invalid });
  if (row.phone && !PHONE_RE.test(String(row.phone).trim())) errors.push({ field: 'phone', msg: m.phone_invalid });
  if (row.priority && !VALID_PRIORITIES.includes(String(row.priority).toUpperCase().trim())) {
    errors.push({ field: 'priority', msg: m.priority_invalid(Object.values(PRIORITY_LABELS[L]).join(', ')) });
  }
  if (row.status && !VALID_STATUSES.includes(String(row.status).toLowerCase().trim())) {
    errors.push({ field: 'status', msg: m.status_invalid(Object.values(STATUS_LABELS[L]).join(', ')) });
  }
  return errors;
}

module.exports = {
  LEAD_FIELDS, VALID_STATUSES, VALID_PRIORITIES, HEADERS, SAMPLE_ROW, SECTOR_LABELS, PRIORITY_LABELS, STATUS_LABELS,
  COLUMN_ALIASES, autoMapColumns, normalizeLeadValues, validateRow, fieldGuide, MSG,
};
