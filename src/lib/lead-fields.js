/**
 * Lead field definitions shared by the bulk-upload template, the upload parser and the export.
 * Everything here is language-aware so a Russian project gets a fully Russian spreadsheet
 * (headers, sample row, field guide) and Russian cell values are mapped back to the
 * machine values the database uses.
 */

const LEAD_FIELDS = [
  'company_name', 'email', 'phone', 'mobile_personal', 'city', 'domain', 'sector',
  'company_size', 'decision_maker_title', 'pain_point', 'find_instructions',
  'notes', 'source_url', 'priority', 'status',
];

const VALID_STATUSES = ['not_contacted','touch_1','touch_2','touch_3','email_sent','call_made','replied','meeting_booked','proposal_sent','negotiating','contract_signed','not_interested','follow_up_later'];
const VALID_PRIORITIES = ['HOT','HIGH','MEDIUM','PARTNER'];

// Column headers written into the downloadable template, per language
const HEADERS = {
  en: {
    company_name: 'Company name', email: 'Email', phone: 'Telephone', mobile_personal: 'Mobile number (personal)', city: 'City',
    domain: 'Domain', sector: 'Industry', company_size: 'Company size', decision_maker_title: 'Decision maker name',
    pain_point: 'Requirement needed', find_instructions: 'Source of lead', notes: 'Comment', source_url: 'Source URL',
    priority: 'Priority', status: 'Status', contact_person: 'Contact person',
  },
  ru: {
    company_name: 'Название компании', email: 'Email', phone: 'Телефон', mobile_personal: 'Мобильный (личный)', city: 'Город',
    domain: 'Сайт (домен)', sector: 'Отрасль', company_size: 'Размер компании', decision_maker_title: 'Имя ЛПР',
    pain_point: 'Требуемая потребность', find_instructions: 'Источник лида', notes: 'Комментарий', source_url: 'Ссылка на источник',
    priority: 'Приоритет', status: 'Статус', contact_person: 'Контактное лицо',
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
    company_name: 'Acme Construction LLC', email: 'info@acmeconstruction.ae', phone: '+971 4 123 4567', mobile_personal: '+971 50 123 4567',
    city: 'Dubai', domain: 'acmeconstruction.ae', sector: 'construction', company_size: '50-100', decision_maker_title: 'Ahmed Al Maktoum',
    pain_point: 'Needs 40 skilled construction workers', find_instructions: 'Big 5 exhibition, LinkedIn', notes: 'Follow up next week',
    source_url: 'https://acmeconstruction.ae', priority: 'HIGH', status: 'not_contacted',
  },
  ru: {
    company_name: 'ООО «СтройИнвест»', email: 'info@stroyinvest.ru', phone: '+7 495 123-45-67', mobile_personal: '+7 916 000-00-00',
    city: 'Москва', domain: 'stroyinvest.ru', sector: 'Строительство', company_size: '50-100', decision_maker_title: 'Иван Петров',
    pain_point: 'Нужны 40 квалифицированных строителей', find_instructions: 'Выставка, LinkedIn', notes: 'Перезвонить на следующей неделе',
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
      [HEADERS.ru.phone, 'Нет', 'Рабочий телефон с кодом страны', '+7 495 123-45-67'],
      [HEADERS.ru.mobile_personal, 'Нет', 'Личный мобильный ЛПР', '+7 916 000-00-00'],
      [HEADERS.ru.city, 'Нет', 'Город компании', 'Москва, Санкт-Петербург и т.д.'],
      [HEADERS.ru.domain, 'Нет', 'Домен сайта компании', 'example.ru'],
      [HEADERS.ru.sector, 'Нет', 'Отрасль', list(SECTOR_LABELS)],
      [HEADERS.ru.company_size, 'Нет', 'Примерный размер компании', '10-50, 50-100, 100-500, 500+'],
      [HEADERS.ru.decision_maker_title, 'Нет', 'Имя лица, принимающего решения', 'Имя и фамилия'],
      [HEADERS.ru.pain_point, 'Нет', 'Что требуется клиенту', 'Свободный текст'],
      [HEADERS.ru.find_instructions, 'Нет', 'Откуда получен лид', 'Выставка, LinkedIn, рекомендация и т.д.'],
      [HEADERS.ru.notes, 'Нет', 'Комментарий', 'Свободный текст'],
      [HEADERS.ru.source_url, 'Нет', 'Ссылка на источник', 'https://...'],
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
      [HEADERS.en.company_name, 'YES', 'Company or organization name', 'Any text (2-120 chars)'],
      [HEADERS.en.email, 'No', 'Contact email address', 'Valid email format'],
      [HEADERS.en.phone, 'No', 'Office telephone with country code', '+971 4 123 4567'],
      [HEADERS.en.mobile_personal, 'No', 'Personal mobile of the decision maker', '+971 50 123 4567'],
      [HEADERS.en.city, 'No', 'City where company is located', 'Dubai, Riyadh, etc.'],
      [HEADERS.en.domain, 'No', 'Company website domain', 'example.com'],
      [HEADERS.en.sector, 'No', 'Industry', Object.keys(SECTOR_LABELS.en).join(', ')],
      [HEADERS.en.company_size, 'No', 'Approximate company size', '10-50, 50-100, 100-500, 500+'],
      [HEADERS.en.decision_maker_title, 'No', 'Name of the decision maker', 'Full name'],
      [HEADERS.en.pain_point, 'No', 'What the client needs', 'Free text'],
      [HEADERS.en.find_instructions, 'No', 'Where the lead came from', 'Exhibition, LinkedIn, referral, etc.'],
      [HEADERS.en.notes, 'No', 'Comment', 'Free text'],
      [HEADERS.en.source_url, 'No', 'Link to the source', 'https://...'],
      [HEADERS.en.priority, 'No', 'Lead priority level', VALID_PRIORITIES.join(', ')],
      [HEADERS.en.status, 'No', 'Lead status', VALID_STATUSES.join(', ')],
    ],
    widths: [{ wch: 24 }, { wch: 10 }, { wch: 40 }, { wch: 60 }],
  };
}

// ─── Header → field aliases (both languages, case-insensitive) ────────────
const COLUMN_ALIASES = {
  company_name: ['company_name', 'company', 'company name', 'organization', 'org', 'business', 'business name', 'name',
    'название компании', 'компания', 'название', 'организация', 'наименование', 'наименование компании', 'фирма'],
  email: ['email', 'email address', 'e-mail', 'mail', 'contact email', 'эл. почта', 'электронная почта', 'почта', 'емейл', 'имейл', 'e-mail адрес'],
  phone: ['phone', 'phone number', 'telephone', 'tel', 'contact phone', 'office phone', 'work phone', 'телефон', 'тел', 'тел.', 'номер телефона', 'рабочий телефон'],
  mobile_personal: ['mobile_personal', 'mobile number (personal)', 'mobile number', 'mobile', 'personal mobile', 'cell', 'cell phone', 'whatsapp',
    'мобильный (личный)', 'мобильный', 'личный мобильный', 'личный телефон', 'мобильный номер', 'сотовый', 'ватсап'],
  city: ['city', 'location', 'town', 'area', 'город', 'населённый пункт', 'населенный пункт', 'регион', 'город/регион'],
  domain: ['domain', 'website domain', 'web domain', 'домен', 'сайт', 'сайт (домен)', 'веб-сайт', 'website'],
  sector: ['sector', 'industry', 'type', 'category', 'business type', 'отрасль', 'сектор', 'индустрия', 'сфера', 'категория', 'вид деятельности'],
  find_instructions: ['find_instructions', 'source of lead', 'lead source', 'where to find', 'found via', 'источник лида', 'источник', 'откуда лид', 'где найти'],
  company_size: ['company_size', 'company size', 'size', 'employees', 'staff', 'headcount', 'размер компании', 'размер', 'численность', 'сотрудники', 'штат'],
  decision_maker_title: ['decision_maker_title', 'decision maker name', 'decision maker', 'decision maker title', 'title', 'position', 'job title', 'designation', 'имя лпр', 'лпр', 'должность лпр', 'должность', 'позиция', 'должность контакта'],
  contact_person: ['contact_person', 'contact person', 'contact name', 'contact', 'person', 'poc', 'point of contact', 'контактное лицо', 'контакт', 'имя контакта', 'фио', 'ф.и.о.', 'контактное лицо (фио)'],
  pain_point: ['pain_point', 'requirement needed', 'requirement', 'requirements', 'pain point', 'need', 'why they need', 'challenge', 'требуемая потребность', 'потребность / боль', 'потребность', 'требование', 'требования', 'боль', 'проблема', 'запрос', 'потребности'],
  notes: ['notes', 'note', 'comment', 'comments', 'remarks', 'description', 'комментарий', 'комментарии', 'заметки', 'примечание', 'примечания', 'описание'],
  source_url: ['source_url', 'source url', 'url', 'link', 'website url', 'ссылка на источник', 'источник (url)', 'ссылка', 'url источника'],
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
