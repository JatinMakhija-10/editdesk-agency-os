export const HISTORICAL_YEARLY_BASELINES = [
  {
    year: 2025,
    total_received: 18500,
    total_paid: 11200,
    total_profit: 7300,
    notes: 'Sample 2025 annual summary baseline',
  },
];

export const CLIENT_NORMALIZATION = {
  'Nova Fit': { canonical: 'Nova Fitness', alias: 'Nova Fit' },
  'Bloom': { canonical: 'Bloom Care', alias: 'Bloom' },
};

export const EDITOR_NORMALIZATION = {
  'Self ': 'Owner',
  Self: 'Owner',
};

// Clean sample dataset SYN0001..SYN0012 demonstrating all EditDesk workflows
// Format: [orderCode, orderDate, rawClient, category, amountReceived, clientStatusCsv, rawEditor, editorPaid, editorStatusCsv, notes]
export const HISTORICAL_ORDERS_2026 = [
  ['SYN0001', '2026-08-05', 'Nova Fitness', 'Shorts', 1200, 'Completed', 'Rohan', 600, 'Completed', ''],
  ['SYN0002', '2026-08-18', 'Pixel Labs', 'Script Writing', 800, 'Completed', 'Kabir', 400, 'Completed', ''],
  ['SYN0003', '2026-09-04', 'Bloom Care', 'Shorts', 1500, 'Completed', 'Rohan', 700, 'Completed', ''],
  ['SYN0004', '2026-09-19', 'UrbanRoast', 'Video Edit', 3200, 'Completed', 'Rohan', 1900, 'Completed', ''],
  ['SYN0005', '2026-10-03', 'Pixel Labs', 'Website Blogs', 1400, 'Completed', 'Meera', 600, 'Completed', ''],
  ['SYN0006', '2026-10-14', 'Bloom Care', 'Instagram Posts', 900, 'Completed', 'Owner', 0, 'Completed', ''],
  ['SYN0007', '2026-10-28', 'Nova Fit', 'Video Edit', 2800, 'Completed', 'Rohan', 1600, 'Completed', ''],
  ['SYN0008', '2026-11-06', 'Bloom', 'Shorts', 2400, 'Completed', 'Rohan', 1100, '', 'Pending payout settlement for Rohan'],
  ['SYN0009', '2026-11-15', 'UrbanRoast', 'Shorts', 1000, '', '', null, '', 'Editor not yet assigned'],
  ['SYN0010', '2026-11-18', 'Bloom Care', 'Shorts', null, '', 'Kabir', 450, '', 'Rate pending client confirmation'],
  ['SYN0011', '2026-11-22', 'Bloom Care', 'Shorts', 1800, '', 'Rohan', 650, '', 'Client invoice unpaid'],
  ['SYN0012', '2026-11-24', 'Nova Fitness', 'Video Edit', 2500, '', 'Rohan', 1200, '', 'In editing / unpaid'],
];
