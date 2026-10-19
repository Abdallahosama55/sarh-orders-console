import type { UserRole } from '@orders/shared';

/** Seeded logins. Plain-text passwords are allowed in the README by the brief; only hashes are stored. */
export const SEED_USERS: ReadonlyArray<{
  email: string;
  name: string;
  role: UserRole;
  password: string;
}> = [
  { email: 'admin@sarh.test', name: 'Mona Al-Rashid', role: 'admin', password: 'Admin#2026' },
  { email: 'agent@sarh.test', name: 'Omar Haddad', role: 'agent', password: 'Agent#2026' },
  { email: 'agent2@sarh.test', name: 'Lina Saleh', role: 'agent', password: 'Agent#2026' },
];

// prettier-ignore
export const LATIN_FIRST_NAMES = [
  'Ahmed', 'Mohammed', 'Abdullah', 'Omar', 'Khalid', 'Faisal', 'Fahad', 'Sultan', 'Yousef', 'Ali',
  'Hassan', 'Ibrahim', 'Majed', 'Nasser', 'Turki', 'Bandar', 'Saleh', 'Hamza', 'Ziyad', 'Rayan',
  'Fatimah', 'Aisha', 'Noura', 'Sara', 'Reem', 'Lama', 'Hessa', 'Maha', 'Dana', 'Haya',
  'Jawaher', 'Latifa', 'Mona', 'Rana', 'Abeer', 'Amal', 'Huda', 'Layla', 'Mariam', 'Nada',
  'John', 'Emily', 'Michael', 'Sophia', 'David', 'Olivia', 'Daniel', 'Emma', 'James', 'Ava',
  'Wei', 'Priya', 'Arjun', 'Carlos', 'Maria', 'Kenji', 'Yuki', 'Mehmet', 'Elif', 'Tariq',
];

// prettier-ignore
export const LATIN_LAST_NAMES = [
  'Al-Harbi', 'Al-Otaibi', 'Al-Qahtani', 'Al-Ghamdi', 'Al-Zahrani', 'Al-Shehri', 'Al-Dosari',
  'Al-Mutairi', 'Al-Shammari', 'Al-Anazi', 'Al-Subaie', 'Al-Malki', 'Al-Amri', 'Al-Juhani',
  'Al-Rashid', 'Al-Sulami', 'Al-Hazmi', 'Al-Khaldi', 'Al-Tamimi', 'Al-Yami', 'Al-Balawi',
  'Al-Ruwaili', 'Bakr', 'Mansour', 'Haddad', 'Khoury', 'Nasser', 'Saleh', 'Farouk', 'Hamdan',
  'Smith', 'Johnson', 'Brown', 'Garcia', "O'Brien", 'Chen', 'Wang', 'Kumar', 'Sharma', 'Tanaka',
  'Sato', 'Yilmaz', 'Demir', 'Rossi', 'Novak', 'Silva', 'Costa', 'Ibrahim', 'Osman', 'Yusuf',
];

/** Arabic-script names with the transliteration used for their email address. */
// prettier-ignore
export const ARABIC_FIRST_NAMES: ReadonlyArray<readonly [arabic: string, latin: string]> = [
  ['محمد', 'mohammed'], ['أحمد', 'ahmed'], ['عبدالله', 'abdullah'], ['خالد', 'khalid'],
  ['فهد', 'fahad'], ['نورة', 'noura'], ['سارة', 'sara'], ['ريم', 'reem'], ['لمى', 'lama'],
  ['هيفاء', 'haifa'], ['سلطان', 'sultan'], ['منيرة', 'munira'],
];

// prettier-ignore
export const ARABIC_LAST_NAMES: ReadonlyArray<readonly [arabic: string, latin: string]> = [
  ['الحربي', 'alharbi'], ['العتيبي', 'alotaibi'], ['القحطاني', 'alqahtani'], ['الغامدي', 'alghamdi'],
  ['الزهراني', 'alzahrani'], ['الشهري', 'alshehri'], ['الدوسري', 'aldosari'], ['المطيري', 'almutairi'],
];

/** RFC 2606 reserved domains: seed emails can never belong to a real person. */
export const EMAIL_DOMAINS = ['example.com', 'example.net', 'example.org', 'mail.example.com'];

export const PRODUCTS: ReadonlyArray<{ name: string; priceCents: number }> = [
  { name: 'Wireless Earbuds', priceCents: 19_900 },
  { name: 'Phone Case', priceCents: 4_900 },
  { name: 'USB-C Cable (2 m)', priceCents: 2_900 },
  { name: 'Power Bank 20,000 mAh', priceCents: 14_900 },
  { name: 'Smart Watch', priceCents: 89_900 },
  { name: 'Laptop Stand', priceCents: 12_900 },
  { name: 'Mechanical Keyboard', priceCents: 34_900 },
  { name: 'Gaming Mouse', priceCents: 18_900 },
  { name: '27" Monitor', priceCents: 129_900 },
  { name: 'Coffee Beans 1 kg', priceCents: 8_500 },
  { name: 'Arabic Coffee Dallah', priceCents: 12_000 },
  { name: 'Sukkari Dates Gift Box', priceCents: 9_500 },
  { name: 'Oud Perfume 50 ml', priceCents: 45_000 },
  { name: 'Prayer Mat', priceCents: 7_500 },
  { name: 'Abaya', priceCents: 32_000 },
  { name: 'Thobe', priceCents: 26_000 },
  { name: 'Shemagh', priceCents: 14_000 },
  { name: 'Kids Backpack', priceCents: 11_000 },
  { name: 'Water Bottle', priceCents: 3_900 },
  { name: 'Desk Lamp', priceCents: 9_900 },
  { name: 'Air Fryer', priceCents: 39_900 },
  { name: 'Blender', priceCents: 21_900 },
  { name: 'Bedsheet Set', priceCents: 17_900 },
  { name: 'Running Shoes', priceCents: 34_900 },
  { name: 'Sunglasses', priceCents: 24_900 },
  { name: 'Notebook Pack', priceCents: 2_500 },
  { name: 'Board Game', priceCents: 13_500 },
  { name: 'Bluetooth Speaker', priceCents: 22_900 },
  { name: '10" Tablet', priceCents: 109_900 },
  { name: '30 W Phone Charger', priceCents: 6_900 },
  { name: 'Screen Protector', priceCents: 3_500 },
  { name: 'Hair Dryer', priceCents: 18_900 },
  { name: 'Electric Kettle', priceCents: 11_900 },
  { name: 'Incense Burner (Mabkhara)', priceCents: 8_900 },
  { name: 'Saffron 5 g', priceCents: 6_500 },
  { name: 'Sidr Honey 500 g', priceCents: 21_000 },
  { name: 'Tea Set', priceCents: 15_500 },
  { name: 'Yoga Mat', priceCents: 9_500 },
  { name: 'Car Phone Holder', priceCents: 4_500 },
  { name: 'Leather Wallet', priceCents: 12_000 },
];
