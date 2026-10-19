/**
 * Lead status / priority / sector display config — single source of truth, shared by the Leads page,
 * the Priority Leads page, and anything else that needs to render or reason about these values.
 *
 * `SC[status].closed` marks a status as a dead end (currently just "not interested"): it stays visible
 * in the full Leads list, but is excluded from the Priority Leads view, since a closed lead is no
 * longer something to prioritize.
 */
export const SC = {
  not_contacted:   { label: 'Not Contacted',   bg: '#F1EFE8', text: '#5F5E5A', dot: '#888780', row: '#ffffff' },
  touch_1:         { label: 'Touch 1',          bg: '#DBEAFE', text: '#1e40af', dot: '#3b82f6', row: '#eff6ff' },
  touch_2:         { label: 'Touch 2',          bg: '#FEF3C7', text: '#92400e', dot: '#f59e0b', row: '#fffbeb' },
  touch_3:         { label: 'Touch 3',          bg: '#D1FAE5', text: '#065f46', dot: '#10b981', row: '#ecfdf5' },
  email_sent:      { label: 'Email Sent',       bg: '#DBEAFE', text: '#185FA5', dot: '#378ADD', row: '#eff6ff' },
  call_made:       { label: 'Call Made',         bg: '#EEEDFE', text: '#3C3489', dot: '#7F77DD', row: '#f5f3ff' },
  replied:         { label: 'Replied',           bg: '#E1F5EE', text: '#0F6E56', dot: '#1D9E75', row: '#f0fdf4' },
  meeting_booked:  { label: 'Meeting Booked',    bg: '#EAF3DE', text: '#3B6D11', dot: '#639922', row: '#ecfdf5' },
  proposal_sent:   { label: 'Proposal Sent',     bg: '#FAEEDA', text: '#854F0B', dot: '#EF9F27', row: '#fffbeb' },
  negotiating:     { label: 'Negotiating',       bg: '#FCE4D6', text: '#993C1D', dot: '#D85A30', row: '#fff7ed' },
  contract_signed: { label: 'Contract Signed – Closed ✓', bg: '#9FE1CB', text: '#085041', dot: '#1D9E75', row: '#d1fae5', closed: true },
  not_interested:  { label: 'Not Interested (Closed)', bg: '#FCEBEB', text: '#A32D2D', dot: '#E24B4A', row: '#fef2f2', closed: true },
  follow_up_later: { label: 'Follow Up Later',   bg: '#FFF2CC', text: '#7D6608', dot: '#EF9F27', row: '#fefce8' },
};

// Closed statuses leave the working lead list, Priority and the Dashboard; they are only shown when
// explicitly filtered for (their Dashboard cards / the status filter).
export const CLOSED_STATUSES = Object.keys(SC).filter(k => SC[k].closed);

export const PC = {
  HOT: { label: '🔥 HOT', bg: '#FCE4D6', text: '#993C1D', rank: 0 },
  HIGH: { label: '⚡ HIGH', bg: '#E2F0D9', text: '#3B6D11', rank: 1 },
  MEDIUM: { label: '● MEDIUM', bg: '#DBEAFE', text: '#185FA5', rank: 2 },
  PARTNER: { label: '🤝 PARTNER', bg: '#EEEDFE', text: '#3C3489', rank: 3 },
};

export const SL = { construction:'Construction', manufacturing:'Manufacturing', warehouse_logistics:'Warehouse/Logistics', food_processing:'Food Processing', metallurgy:'Metallurgy', mining:'Mining', chemicals:'Chemicals', automotive:'Automotive', hospitality:'Hospitality', retail:'Retail', agency_partner:'Agency Partner', industry_association:'Industry Association', other:'Other' };
