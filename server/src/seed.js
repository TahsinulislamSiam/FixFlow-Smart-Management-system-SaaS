/**
 * FixFlow demo seeder
 * ===================
 * Generates a believable 3-week maintenance history so every screen — the
 * analytics dashboard, the SLA board, the technician leaderboard, the
 * notification feed — has something meaningful in it.
 *
 * Two deliberate design choices:
 *  1. Tickets are triaged with the *real* AI service (`analyseHeuristic`), so
 *     the seeded database is always consistent with what the engine would
 *     produce for a live report.
 *  2. All randomness comes from a seeded PRNG, so `npm run seed` is
 *     reproducible and screenshots don't shuffle between runs.
 *
 *   npm run seed            # seed if empty
 *   npm run reset           # wipe db + uploads, then seed
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, all, get, run, nowIso, scalar } from './db.js';
import { config } from './config.js';
import { hashPassword } from './util/password.js';
import { analyseHeuristic, computeSlaDueAt } from './services/ai.js';
import { rankTechnicians } from './services/assignment.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const RESET = args.has('--reset') || args.has('--force');

/* -------------------------------------------------------------------------- */
/* Deterministic randomness                                                   */
/* -------------------------------------------------------------------------- */

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260111);
const pick = (list) => list[Math.floor(rand() * list.length)];
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (probability) => rand() < probability;

/** ISO timestamp for `minutes` before now. */
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
/** ISO timestamp for `minutes` after an ISO base. */
const plusMinutes = (iso, minutes) => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

/* -------------------------------------------------------------------------- */
/* Reference data                                                             */
/* -------------------------------------------------------------------------- */

const CATEGORIES = [
  { key: 'electrical', name: 'Electrical', icon: '⚡', default_priority: 'HIGH', sla_hours: 8, description: 'Power, wiring, lighting, switchboards and generators.' },
  { key: 'plumbing', name: 'Plumbing & Water', icon: '🚰', default_priority: 'HIGH', sla_hours: 8, description: 'Leaks, drains, toilets, water pressure and supply.' },
  { key: 'hvac', name: 'HVAC & Climate', icon: '❄️', default_priority: 'MEDIUM', sla_hours: 12, description: 'Air conditioning, ventilation, heating and air quality.' },
  { key: 'elevator', name: 'Elevators & Lifts', icon: '🛗', default_priority: 'HIGH', sla_hours: 4, description: 'Lift faults, entrapment, doors and escalators.' },
  { key: 'it_network', name: 'IT & Network', icon: '📶', default_priority: 'MEDIUM', sla_hours: 8, description: 'Wi-Fi, network, printers, displays and access systems.' },
  { key: 'cleaning', name: 'Cleaning & Housekeeping', icon: '🧹', default_priority: 'LOW', sla_hours: 24, description: 'Cleaning, waste, spills and hygiene.' },
  { key: 'security', name: 'Security & Access', icon: '🛡️', default_priority: 'HIGH', sla_hours: 6, description: 'Access control, CCTV, locks and security incidents.' },
  { key: 'structural', name: 'Structural & Civil', icon: '🏗️', default_priority: 'MEDIUM', sla_hours: 24, description: 'Ceilings, walls, roofs, windows and paving.' },
  { key: 'appliance', name: 'Appliances & Equipment', icon: '🔌', default_priority: 'MEDIUM', sla_hours: 24, description: 'Fridges, ovens, washers and general equipment.' },
  { key: 'pest', name: 'Pest Control', icon: '🐜', default_priority: 'MEDIUM', sla_hours: 48, description: 'Infestations, rodents and insects.' },
  { key: 'furniture', name: 'Furniture & Fixtures', icon: '🪑', default_priority: 'LOW', sla_hours: 48, description: 'Desks, chairs, cabinets, blinds and carpets.' },
  { key: 'other', name: 'General / Unclassified', icon: '🔧', default_priority: 'MEDIUM', sla_hours: 24, description: 'Anything that does not fit another trade.' },
];

const LOCATIONS = [
  { name: 'Atrium Tower — Main Lobby', building: 'Atrium Tower', floor: 'G', zone: 'North Zone', address: '12 Harbour Road', lat: 24.8607, lng: 67.0011 },
  { name: 'Atrium Tower — Level 7 Open Office', building: 'Atrium Tower', floor: '7', zone: 'North Zone', address: '12 Harbour Road', lat: 24.8609, lng: 67.0014 },
  { name: 'Atrium Tower — Level 12 Boardroom', building: 'Atrium Tower', floor: '12', zone: 'North Zone', address: '12 Harbour Road', lat: 24.8611, lng: 67.0016 },
  { name: 'Cedar Residence — Block B', building: 'Cedar Residence', floor: '4', zone: 'East Zone', address: '88 Cedar Lane', lat: 24.8751, lng: 67.0612 },
  { name: 'Cedar Residence — Block D', building: 'Cedar Residence', floor: '9', zone: 'East Zone', address: '88 Cedar Lane', lat: 24.8755, lng: 67.0618 },
  { name: 'Meridian University — Science Block', building: 'Science Block', floor: '2', zone: 'Campus Zone', address: '200 University Avenue', lat: 24.9412, lng: 67.1144 },
  { name: 'Meridian University — Library', building: 'Library', floor: '1', zone: 'Campus Zone', address: '200 University Avenue', lat: 24.9418, lng: 67.1149 },
  { name: 'Meridian University — Hostel C', building: 'Hostel C', floor: '3', zone: 'Campus Zone', address: '204 University Avenue', lat: 24.9425, lng: 67.1156 },
  { name: 'Harbour Mall — Food Court', building: 'Harbour Mall', floor: '2', zone: 'South Zone', address: '5 Marina Boulevard', lat: 24.8123, lng: 67.0321 },
  { name: 'Harbour Mall — Parking Level P1', building: 'Harbour Mall', floor: 'P1', zone: 'South Zone', address: '5 Marina Boulevard', lat: 24.8121, lng: 67.0325 },
  { name: 'Northgate Business Park — Unit 14', building: 'Northgate', floor: '1', zone: 'West Zone', address: '44 Industrial Way', lat: 24.8931, lng: 66.9822 },
  { name: 'Northgate Business Park — Warehouse', building: 'Northgate', floor: 'G', zone: 'West Zone', address: '44 Industrial Way', lat: 24.8934, lng: 66.9829 },
  { name: 'Riverside Clinic — Ward 2', building: 'Riverside Clinic', floor: '2', zone: 'South Zone', address: '9 Riverside Drive', lat: 24.8288, lng: 67.0701 },
  { name: 'Riverside Clinic — Reception', building: 'Riverside Clinic', floor: 'G', zone: 'South Zone', address: '9 Riverside Drive', lat: 24.8285, lng: 67.0705 },
];

const STAFF = [
  { name: 'Amara Osei', email: 'admin@fixflow.dev', role: 'ADMIN', title: 'Chief Operations Officer', zone: 'North Zone', level: 'LEAD', skills: [] },
  { name: 'Daniel Fischer', email: 'manager@fixflow.dev', role: 'MANAGER', title: 'Maintenance Manager', zone: 'North Zone', level: 'LEAD', skills: [] },
  { name: 'Priya Raman', email: 'manager2@fixflow.dev', role: 'MANAGER', title: 'Facilities Coordinator', zone: 'Campus Zone', level: 'SENIOR', skills: [] },
  { name: 'Marcus Reed', email: 'tech.electrical@fixflow.dev', role: 'TECHNICIAN', title: 'Senior Electrical Engineer', zone: 'North Zone', level: 'SENIOR', skills: ['electrical', 'it_network', 'elevator'] },
  { name: 'Lena Novak', email: 'tech.hvac@fixflow.dev', role: 'TECHNICIAN', title: 'HVAC Specialist', zone: 'South Zone', level: 'SENIOR', skills: ['hvac', 'appliance', 'plumbing'] },
  { name: 'Tobias Klein', email: 'tech.plumbing@fixflow.dev', role: 'TECHNICIAN', title: 'Master Plumber', zone: 'East Zone', level: 'LEAD', skills: ['plumbing', 'hvac', 'structural'] },
  { name: 'Sofia Marino', email: 'tech.it@fixflow.dev', role: 'TECHNICIAN', title: 'Network Technician', zone: 'Campus Zone', level: 'SENIOR', skills: ['it_network', 'security', 'electrical'] },
  { name: 'Ahmed Karim', email: 'tech.lift@fixflow.dev', role: 'TECHNICIAN', title: 'Lift & Escalator Technician', zone: 'North Zone', level: 'LEAD', skills: ['elevator', 'electrical', 'structural'] },
  { name: 'Grace Owusu', email: 'tech.cleaning@fixflow.dev', role: 'TECHNICIAN', title: 'Housekeeping Supervisor', zone: 'East Zone', level: 'SENIOR', skills: ['cleaning', 'pest', 'furniture'] },
  { name: 'Ravi Menon', email: 'tech.structural@fixflow.dev', role: 'TECHNICIAN', title: 'Civil Works Technician', zone: 'West Zone', level: 'JUNIOR', skills: ['structural', 'furniture', 'plumbing'] },
  { name: 'Nadia Haddad', email: 'tech.security@fixflow.dev', role: 'TECHNICIAN', title: 'Security Systems Officer', zone: 'South Zone', level: 'SENIOR', skills: ['security', 'it_network'] },
  { name: 'Jonas Weber', email: 'tech.appliance@fixflow.dev', role: 'TECHNICIAN', title: 'Appliance Technician', zone: 'Campus Zone', level: 'JUNIOR', skills: ['appliance', 'electrical', 'pest'] },
];

const REQUESTERS = [
  { name: 'Hannah Cole', email: 'hannah@fixflow.dev', title: 'Office Manager', department: 'Atrium Tower', zone: 'North Zone' },
  { name: 'Omar Siddiqui', email: 'omar@fixflow.dev', title: 'Resident', department: 'Cedar Residence', zone: 'East Zone' },
  { name: 'Dr. Yuki Tanaka', email: 'yuki@fixflow.dev', title: 'Lab Director', department: 'Science Block', zone: 'Campus Zone' },
  { name: 'Fatima Zahra', email: 'fatima@fixflow.dev', title: 'Ward Sister', department: 'Riverside Clinic', zone: 'South Zone' },
  { name: 'Peter Lindqvist', email: 'peter@fixflow.dev', title: 'Mall Operations', department: 'Harbour Mall', zone: 'South Zone' },
  { name: 'Chloe Bennett', email: 'chloe@fixflow.dev', title: 'Warehouse Lead', department: 'Northgate', zone: 'West Zone' },
  { name: 'Samuel Adeyemi', email: 'samuel@fixflow.dev', title: 'Hostel Warden', department: 'Meridian University', zone: 'Campus Zone' },
  { name: 'Ines Duarte', email: 'ines@fixflow.dev', title: 'Facilities Assistant', department: 'Atrium Tower', zone: 'North Zone' },
];

/**
 * Realistic reports. The description text is what the AI triage engine reads —
 * including a few deliberate life-safety and de-escalation signals so the
 * flagship features have real examples on screen.
 */
const ISSUES = [
  { location: 3, requester: 1, title: 'Water pouring through the bathroom ceiling', description: 'Water has been pouring through the ceiling of apartment 4B since last night. The ceiling is soaked and water is dripping onto the electrical socket next to the mirror. This is a burst pipe somewhere above us and it keeps happening every rainy season.' },
  { location: 2, requester: 0, title: 'Spark and burning smell from the boardroom socket', description: 'When I plugged the projector into the socket near the boardroom table there was a loud spark and a burning smell. The socket is blackened and the breaker tripped. Client presentation is in two hours and we cannot use the room.' },
  { location: 4, requester: 3, title: 'Lift is stuck between floors — someone inside', description: 'The service lift stopped between floor 2 and 3 and there is someone trapped inside. We can hear knocking. Please send someone immediately, this is an emergency.' },
  { location: 6, requester: 2, title: 'Lab air conditioning not cooling, samples at risk', description: 'The AC in the science lab is blowing warm air and the room temperature has climbed to 29 degrees. We have temperature-sensitive samples in the fridge and they are at risk if the room keeps heating up. This is urgent.' },
  { location: 0, requester: 7, title: 'Main lobby lighting flickering badly', description: 'About six of the downlights in the main lobby are flickering constantly. It looks bad during client visits but it is not urgent, whenever possible please look at it.' },
  { location: 10, requester: 5, title: 'Gas smell near the warehouse loading bay', description: 'There is a strong smell of gas near the loading bay door. We have evacuated the immediate area and told staff to stay clear. Please come now.' },
  { location: 9, requester: 4, title: 'Blocked drain flooding parking level P1', description: 'The drain in the parking ramp is blocked and water is overflowing across P1. Cars are getting soaked and the water is ankle deep. Sewage smell is starting to build up.' },
  { location: 5, requester: 2, title: 'Wi-Fi completely down across the science block', description: 'The whole science block lost Wi-Fi about an hour ago. All 40 students cannot connect, the access point lights look off. Nothing works, teaching is stopped.' },
  { location: 12, requester: 3, title: 'Sockets in Ward 2 have no power', description: 'There is no power in any of the sockets in Ward 2 since 6am. The patients monitors are running on battery backup and we cannot run the steriliser. This is critical for patient care.' },
  { location: 8, requester: 4, title: 'Food court toilet blocked and overflowing', description: 'The mens toilet in the food court is blocked and overflowing into the corridor. Customers are complaining and it smells terrible. Please send someone to clean and fix the blockage.' },
  { location: 13, requester: 3, title: 'Crack appearing in reception wall', description: 'A crack has appeared in the reception wall above the doorway. It is getting wider over the last week and plaster is falling. It may be structural, please inspect.' },
  { location: 1, requester: 0, title: 'Ceiling tiles missing in level 7 open office', description: 'Two ceiling tiles fell out above the desks in level 7. Nobody was hurt but we are worried about the rest of the ceiling in that corner. Paint and tiles look old.' },
  { location: 7, requester: 6, title: 'Cockroaches in Hostel C kitchen area', description: 'There are cockroaches in the shared kitchen on floor 3, we see them every night now. It is becoming an infestation. The students are refusing to cook there.' },
  { location: 11, requester: 5, title: 'Warehouse fridge not working', description: 'The large fridge in the warehouse is running but not cooling. Temperature is 12 degrees. It has frozen food inside that will spoil.' },
  { location: 4, requester: 1, title: 'Pest control follow-up needed in Block D', description: 'Following the treatment last week we are still seeing mice in unit 9C. Please schedule a follow-up inspection.' },
  { location: 0, requester: 7, title: 'Reception desk chair broken and wobbly', description: 'The chair at the reception desk has a broken leg and is very wobbly. Someone could fall. It is a minor thing but unsafe to sit on.' },
  { location: 6, requester: 2, title: 'Library roof leaking onto the study desks', description: 'The library roof leaks over the study area whenever it rains. We have put buckets out but books and laptops are getting damaged. There is damp on the ceiling.' },
  { location: 2, requester: 0, title: 'Thermostat not responding on level 12', description: 'The thermostat on level 12 does not respond and the floor is consistently too cold, staff are wearing coats indoors. The screen is blank.' },
  { location: 3, requester: 1, title: 'Front gate access card reader broken', description: 'The access card reader on the front gate stopped working yesterday. Residents cannot get in and we have had to prop the gate open, which is a security risk.' },
  { location: 9, requester: 4, title: 'CCTV camera at P1 not recording', description: 'Camera 4 on parking level P1 is showing offline in the security console. We cannot see the exit ramp. There was a suspicious incident last week we could not review.' },
  { location: 5, requester: 2, title: 'Projector in lecture theatre 2 not working', description: 'The projector in lecture theatre 2 will not turn on. The green light blinks and the screen stays black. A guest lecture is scheduled.' },
  { location: 8, requester: 4, title: 'Spill in food court seating area', description: 'Someone spilled a drink across the seating area near the escalator. Please send housekeeping before it stains the floor. It is slippery.' },
  { location: 1, requester: 7, title: 'Rats seen in level 7 kitchenette', description: 'We saw rats run behind the kitchenette cupboards on level 7. One staff member also saw droppings. Rodent problem needs treatment.' },
  { location: 13, requester: 3, title: 'Handrail on clinic stairs loose', description: 'The handrail on the main stair to the clinic reception is loose and moves when you lean on it. Patients with mobility issues use this stair.' },
  { location: 12, requester: 3, title: 'Blood on the floor near the treatment room', description: 'There is blood on the corridor floor outside the treatment room. It needs to be cleaned immediately for infection control.' },
  { location: 10, requester: 5, title: 'Warehouse loading shutter jammed', description: 'The loading bay shutter is jammed halfway and cannot be closed. Because it is blocked, deliveries cannot enter and the bay is exposed overnight.' },
  { location: 4, requester: 1, title: 'Washing machine leaking in the laundrette', description: 'The washing machine in the shared laundrette is leaking water across the floor each cycle. It is flooding the corridor slowly.' },
  { location: 7, requester: 6, title: 'Shower has no hot water', description: 'There is no hot water in the third floor showers of Hostel C since yesterday morning. We have a full block of students complaining.' },
  { location: 6, requester: 2, title: 'Exterior paving broken outside the library', description: 'A paving slab outside the library entrance has lifted and is a trip hazard. A student nearly fell this morning.' },
  { location: 2, requester: 0, title: 'Request for additional power sockets in boardroom', description: 'Please consider installing more power sockets along the boardroom wall. It is a suggestion for the next office refresh, not urgent.' },
  { location: 11, requester: 5, title: 'Forklift charger sparking', description: 'The forklift charger sparked when the operator plugged it in and now the unit smells burnt. We have tagged it out of service.' },
  { location: 0, requester: 0, title: 'Main entrance automatic door sticking', description: 'The automatic door at the main entrance sticks halfway and sometimes closes on people. It has been happening for a week and the belt sounds strained.' },
  { location: 5, requester: 2, title: 'Fire extinguisher cabinet broken', description: 'The fire extinguisher cabinet outside the chemistry lab is broken and the extinguisher is exposed. Looks like the hinge snapped.' },
  { location: 9, requester: 4, title: 'Smell of smoke in the car park stairwell', description: 'There is a smell of smoke in the stairwell by the car park, we could not find flames but there is smoke haze near the bin store.' },
  { location: 3, requester: 1, title: 'Kitchen tap dripping constantly', description: 'The kitchen tap in unit 4B drips constantly even when fully closed. It is a small drip but it wastes water overnight.' },
  { location: 1, requester: 7, title: 'Blinds broken in the meeting room', description: 'The blinds in meeting room 7A are stuck at an angle and will not close. The screen glare makes the room unusable in the afternoon.' },
  { location: 12, requester: 3, title: 'Boiler making loud banging noise', description: 'The boiler in the clinic basement makes a loud banging noise when it fires up. It is quite alarming for patients. Temperature is fine for now.' },
  { location: 6, requester: 2, title: 'Desks damaged in study area 3', description: 'Three desks in study area 3 have cracked and unstable legs. Students are avoiding them.' },
  { location: 8, requester: 4, title: 'Air conditioning dripping water in shop unit 12', description: 'The AC unit above shop unit 12 is dripping water onto the display shelves. Stock is getting wet.' },
  { location: 4, requester: 1, title: 'Blocked sink in Block D communal kitchen', description: 'The communal kitchen sink in Block D is blocked and standing water will not drain. It smells bad already.' },
  { location: 10, requester: 5, title: 'Broken window in Unit 14 office', description: 'A window pane in Unit 14 is cracked after the storm. It is holding but we want it replaced before it falls.' },
  { location: 2, requester: 7, title: 'Printer on level 12 offline', description: 'The shared printer on level 12 shows offline for everyone. We restarted it twice.' },
  { location: 7, requester: 6, title: 'Bed bug reports in Hostel C room 3-04', description: 'The student in room 3-04 reported bed bug bites and we found evidence in the mattress seams. This needs urgent pest treatment and room isolation.' },
  { location: 13, requester: 3, title: 'Wheelchair ramp handrail paint coming off', description: 'The paint on the wheelchair ramp handrail is peeling. Purely aesthetic, no rush.' },
  { location: 5, requester: 2, title: 'Emergency lights not charging in lab corridor', description: 'The emergency light indicators in the lab corridor are dark, meaning they are not charging. Safety inspection is next week.' },
  { location: 0, requester: 0, title: 'Coffee machine leaking in the break room', description: 'The coffee machine leaks water from the base every time it runs a cycle. It has soaked the counter and the under-sink cabinet.' },
];

const RESOLUTION_NOTES = [
  'Replaced the failed component and tested the circuit end to end. Monitor for 48 hours.',
  'Isolated the fault, sourced the part from stores and fitted it on site. Area cleaned up after work.',
  'Temporary containment applied and a permanent fix scheduled with the vendor under the AMC contract.',
  'Root cause was a worn seal — replaced it, pressure-tested and confirmed no further leak.',
  'Recalibrated the unit, replaced the filter and confirmed normal readings before leaving site.',
  'Cleared the blockage, flushed the line and disinfected the surrounding area.',
  'Replaced the damaged part, then photographed the repair for the ticket record.',
];

const REQUESTER_REPLIES = [
  'Thanks, the technician arrived quickly and it looks much better now.',
  'Confirmed the fix is holding, thank you.',
  'It is working again for now — will update if it comes back.',
  'Still a small issue but much improved. Closing this one.',
];

const STAFF_REPLIES = [
  'On site now, investigating the root cause. Will update within the hour.',
  'Parts ordered — expected on site tomorrow morning. Ticket on hold until then.',
  'Attended and confirmed the fault. Preparing a scope of work for approval.',
  'This appears to be a repeat failure of the same asset. Booking a deeper inspection.',
];

const INTERNAL_NOTES = [
  'Budget check: this falls under the Q1 reactive maintenance allocation.',
  'Flagged to the vendor — asset is still under warranty until next March.',
  'Repeat call-out at this location (3rd this month). Recommend a condition survey.',
  'Tenant was informed that the temporary measure is a containment, not a fix.',
];

/* -------------------------------------------------------------------------- */
/* Placeholder imagery                                                        */
/* -------------------------------------------------------------------------- */

function svgPlaceholder({ label, sub, from, to, glyph }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="640" viewBox="0 0 1024 640" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="640" fill="url(#g)"/>
  <g opacity="0.14" fill="#ffffff">
    <circle cx="860" cy="120" r="190"/>
    <circle cx="150" cy="560" r="240"/>
  </g>
  <text x="72" y="300" font-size="188" font-family="Segoe UI Emoji, Apple Color Emoji, sans-serif">${glyph}</text>
  <text x="72" y="410" font-size="58" font-weight="700" fill="#ffffff" font-family="Segoe UI, Helvetica, Arial, sans-serif">${label}</text>
  <text x="72" y="470" font-size="30" fill="#ffffff" opacity="0.82" font-family="Segoe UI, Helvetica, Arial, sans-serif">${sub}</text>
  <text x="72" y="570" font-size="24" fill="#ffffff" opacity="0.6" font-family="Segoe UI, Helvetica, Arial, sans-serif">FixFlow demo attachment · sample image</text>
</svg>`;
}

const IMAGE_STYLE = {
  electrical: { glyph: '⚡', from: '#f59e0b', to: '#b45309', label: 'Electrical fault' },
  plumbing: { glyph: '🚰', from: '#0ea5e9', to: '#075985', label: 'Water damage' },
  hvac: { glyph: '❄️', from: '#22d3ee', to: '#0e7490', label: 'HVAC unit' },
  elevator: { glyph: '🛗', from: '#8b5cf6', to: '#5b21b6', label: 'Lift access' },
  it_network: { glyph: '📶', from: '#6366f1', to: '#3730a3', label: 'Network cabinet' },
  cleaning: { glyph: '🧹', from: '#34d399', to: '#047857', label: 'Area condition' },
  security: { glyph: '🛡️', from: '#f43f5e', to: '#9f1239', label: 'Access point' },
  structural: { glyph: '🏗️', from: '#a8a29e', to: '#57534e', label: 'Structural defect' },
  appliance: { glyph: '🔌', from: '#fbbf24', to: '#c2410c', label: 'Equipment' },
  pest: { glyph: '🐜', from: '#84cc16', to: '#3f6212', label: 'Pest evidence' },
  furniture: { glyph: '🪑', from: '#c084fc', to: '#6d28d9', label: 'Damaged fixture' },
  other: { glyph: '🔧', from: '#94a3b8', to: '#334155', label: 'Reported issue' },
};

function writePlaceholders() {
  const files = {};
  for (const [key, style] of Object.entries(IMAGE_STYLE)) {
    const filename = `seed-${key}.svg`;
    const filepath = path.join(config.uploadDir, filename);
    if (!fs.existsSync(filepath)) {
      fs.writeFileSync(
        filepath,
        svgPlaceholder({ label: style.label, sub: 'Photo submitted with the report', from: style.from, to: style.to, glyph: style.glyph }),
        'utf8',
      );
    }
    files[key] = { url: `/uploads/${filename}`, filename: `${key}-report.svg`, mime: 'image/svg+xml', size: fs.statSync(filepath).size };
  }
  return files;
}

/* -------------------------------------------------------------------------- */
/* Seeding                                                                    */
/* -------------------------------------------------------------------------- */

function wipe() {
  console.log('• Wiping existing data…');
  for (const table of ['assignment_logs', 'ticket_events', 'ticket_attachments', 'comments', 'notifications', 'tickets', 'locations', 'categories', 'users']) {
    db.exec(`DELETE FROM ${table};`);
  }
  db.exec(`DELETE FROM sqlite_sequence;`);
  if (fs.existsSync(config.uploadDir)) {
    for (const entry of fs.readdirSync(config.uploadDir)) {
      if (entry === '.gitkeep') continue;
      fs.rmSync(path.join(config.uploadDir, entry), { force: true, recursive: true });
    }
  }
}

function insertCategory(category) {
  run(
    `INSERT INTO categories (key, name, icon, default_priority, sla_hours, description) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET name = excluded.name, icon = excluded.icon,
       default_priority = excluded.default_priority, sla_hours = excluded.sla_hours, description = excluded.description`,
    [category.key, category.name, category.icon, category.default_priority, category.sla_hours, category.description],
  );
}

const AVATARS = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#a855f7', '#22c55e', '#ec4899', '#f97316', '#06b6d4', '#84cc16', '#d946ef'];

function insertUsers() {
  const password = hashPassword(process.env.DEMO_PASSWORD ?? 'FixFlow123!');
  const ids = { admins: [], managers: [], technicians: [], requesters: [] };
  let colorIndex = 0;

  for (const person of [...STAFF, ...REQUESTERS.map((r) => ({ ...r, role: 'REQUESTER', level: 'JUNIOR', skills: [] }))]) {
    const { lastInsertRowid } = run(
      `INSERT INTO users (name, email, password_hash, role, level, phone, title, department, zone, skills, is_available, avatar_color, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        person.name,
        person.email,
        password,
        person.role,
        person.level ?? 'JUNIOR',
        `+1 (555) ${int(100, 999)}-${int(1000, 9999)}`,
        person.title ?? null,
        person.department ?? null,
        person.zone ?? null,
        JSON.stringify(person.skills ?? []),
        // A couple of technicians are off shift so the availability rules are visible.
        person.role === 'TECHNICIAN' && chance(0.15) ? 0 : 1,
        AVATARS[colorIndex++ % AVATARS.length],
        minutesAgo(int(20000, 40000)),
      ],
    );
    const id = Number(lastInsertRowid);
    if (person.role === 'ADMIN') ids.admins.push(id);
    else if (person.role === 'MANAGER') ids.managers.push(id);
    else if (person.role === 'TECHNICIAN') ids.technicians.push(id);
    else ids.requesters.push(id);
  }
  return ids;
}

function insertLocations() {
  const ids = [];
  for (const location of LOCATIONS) {
    const { lastInsertRowid } = run(
      `INSERT INTO locations (name, building, floor, zone, address, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [location.name, location.building, location.floor, location.zone, location.address, location.lat, location.lng],
    );
    ids.push(Number(lastInsertRowid));
  }
  return ids;
}

function nextCode(index) {
  const year = new Date().getUTCFullYear();
  return `FF-${year}-${String(index).padStart(4, '0')}`;
}

function insertTicket({ index, issue, analysis, priority, category, status, assigneeId, slaDueAt, createdAt, updatedAt, priorityOverridden, attachments, images }) {
  const { lastInsertRowid } = run(
    `INSERT INTO tickets (
       code, title, description, category, priority, status, requester_id, assignee_id, location_id, location_text,
       latitude, longitude, ai_summary, ai_confidence, ai_tags, ai_flags, ai_urgency, ai_estimated_hours, ai_model, ai_source,
       sla_due_at, sla_breached, first_response_at, resolved_at, closed_at, priority_overridden, reopen_count, source, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'WEB', ?, ?)`,
    [
      nextCode(index),
      issue.title,
      issue.description,
      category,
      priority,
      status,
      issue.requesterId,
      assigneeId,
      issue.locationId,
      issue.locationName,
      issue.lat,
      issue.lng,
      analysis.summary,
      analysis.confidence,
      JSON.stringify(analysis.tags),
      JSON.stringify(analysis.flags),
      analysis.urgency,
      analysis.estimatedHours,
      analysis.model,
      analysis.source,
      slaDueAt,
      0,
      null,
      null,
      null,
      priorityOverridden ? 1 : 0,
      0,
      createdAt,
      updatedAt,
    ],
  );
  return Number(lastInsertRowid);
}

function addEvent(ticketId, { actorId = null, type, message = null, fromValue = null, toValue = null, meta = null, at }) {
  run(
    `INSERT INTO ticket_events (ticket_id, actor_id, type, message, from_value, to_value, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [ticketId, actorId, type, message, fromValue, toValue, meta ? JSON.stringify(meta) : null, at],
  );
}

function addComment(ticketId, { authorId, body, internal = false, at }) {
  run('INSERT INTO comments (ticket_id, author_id, body, is_internal, created_at) VALUES (?, ?, ?, ?, ?)', [
    ticketId,
    authorId,
    body,
    internal ? 1 : 0,
    at,
  ]);
}

function addAttachment(ticketId, { uploaderId, image, phase, at }) {
  run(
    `INSERT INTO ticket_attachments (ticket_id, uploader_id, url, filename, mime, size, phase, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [ticketId, uploaderId, image.url, image.filename, image.mime, image.size, phase, at],
  );
}

function main() {
  const existing = Number(scalar('SELECT COUNT(*) FROM users') ?? 0);
  if (existing > 0 && !RESET) {
    console.log('• Database already contains data. Use `npm run reset` to wipe and reseed.');
    return;
  }
  if (RESET) wipe();

  console.log('• Seeding reference data…');
  for (const category of CATEGORIES) insertCategory(category);
  const images = writePlaceholders();
  const user = insertUsers();
  const locations = insertLocations();

  const technicians = all(`SELECT id, name, skills, is_available FROM users WHERE role = 'TECHNICIAN'`);
  const allRequesters = [...user.requesters, ...user.managers, ...user.admins];
  const staffActors = [...user.managers, ...user.admins];

  // The newest reports are the most urgent-looking ones, so the queue has texture.
  console.log(`• Generating ${ISSUES.length} tickets with real AI triage…`);

  let index = 1;
  let resolvedCount = 0;
  let breachedCount = 0;

  for (const issue of ISSUES) {
    const location = LOCATIONS[issue.location % LOCATIONS.length];
    const locationId = locations[issue.location % LOCATIONS.length];
    const requesterId = allRequesters[issue.requester % allRequesters.length];

    // 1. Real triage.
    const analysis = analyseHeuristic({ title: issue.title, description: issue.description, locationText: location.name });

    // 2. Spread creation across the last 21 days, weighted towards recent days.
    const ageMinutes = Math.round(Math.pow(rand(), 1.7) * 21 * 24 * 60) + int(5, 90);
    const createdAt = minutesAgo(ageMinutes);

    let category = analysis.category;
    let priority = analysis.priority;
    let priorityOverridden = false;

    // A handful of tickets were re-prioritised by a manager — demonstrates that
    // the AI suggestion is a recommendation, not an unchallengeable verdict.
    if (chance(0.08)) {
      priority = pick(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
      priorityOverridden = priority !== analysis.priority;
    }

    const slaDueAt = computeSlaDueAt(category, priority, createdAt);
    const slaWindowMinutes = Math.max(30, Math.round((new Date(slaDueAt).getTime() - new Date(createdAt).getTime()) / 60_000));
    const ageSinceCreation = Math.round((Date.now() - new Date(createdAt).getTime()) / 60_000);

    // 3. Decide the lifecycle stage from the ticket's age and severity.
    const isFresh = ageSinceCreation < 90;
    const isSevere = priority === 'CRITICAL' || priority === 'HIGH';
    let status;
    if (isFresh) status = pick(isSevere ? ['NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS'] : ['NEW', 'TRIAGED', 'ASSIGNED']);
    else if (chance(0.14)) status = pick(['IN_PROGRESS', 'ON_HOLD', 'ON_HOLD']);
    else if (chance(0.06)) status = 'CANCELLED';
    else if (chance(0.5)) status = 'CLOSED';
    else status = chance(0.55) ? 'RESOLVED' : 'IN_PROGRESS';

    // 4. Assignment for anything past triage.
    let assigneeId = null;
    let assignmentScore = null;
    let assignmentReasons = [];
    if (status !== 'NEW' && status !== 'CANCELLED') {
      const candidates = technicians.filter((tech) => {
        try {
          return JSON.parse(tech.skills ?? '[]').includes(category);
        } catch {
          return false;
        }
      });
      const pool = candidates.length ? candidates : technicians;
      const chosen = pool[Math.floor(rand() * pool.length)];
      assigneeId = chosen.id;
      const ranked = rankTechnicians(
        { category, priority, zone: location.zone, building: location.building },
        { limit: 25, includeUnavailable: true },
      ).find((entry) => entry.technician.id === chosen.id);
      assignmentScore = ranked?.score ?? null;
      assignmentReasons = ranked?.reasons ?? [];
    }

    const isFinished = status === 'RESOLVED' || status === 'CLOSED';

    // 5. Response and resolution timing.
    const respondFactor = isSevere ? 0.3 : 0.62;
    const responseMinutes = Math.max(3, Math.round(slaWindowMinutes * respondFactor * (0.25 + rand() * 1.1)));
    const firstResponseAt = plusMinutes(createdAt, responseMinutes);

    const resolutionMinutes = Math.max(responseMinutes + 12, Math.round(slaWindowMinutes * (0.5 + rand() * 1.4)));
    const resolvedAt = isFinished ? plusMinutes(createdAt, resolutionMinutes) : null;
    const closedAt = status === 'CLOSED' ? plusMinutes(resolvedAt, int(30, 900)) : null;
    const breached = Boolean(resolvedAt) && new Date(resolvedAt) > new Date(slaDueAt);
    const openBreached = !isFinished && new Date(slaDueAt) < new Date();
    if (breached || openBreached) breachedCount += 1;
    if (isFinished) resolvedCount += 1;

    const updatedAt = closedAt ?? resolvedAt ?? (status === 'ON_HOLD' ? plusMinutes(firstResponseAt, int(120, 900)) : firstResponseAt);

    const ticketId = insertTicket({
      index,
      issue: { ...issue, requesterId, locationId, locationName: location.name, lat: location.lat, lng: location.lng },
      analysis,
      priority,
      category,
      status,
      assigneeId,
      slaDueAt,
      createdAt,
      updatedAt,
      priorityOverridden,
    });

    if (breached || openBreached) {
      run('UPDATE tickets SET sla_breached = ? WHERE id = ?', [breached || openBreached ? 1 : 0, ticketId]);
    }

    // 6. Reconstruct the audit trail in chronological order.
    addEvent(ticketId, {
      actorId: requesterId,
      type: 'CREATED',
      message: `Ticket raised (AI triage: ${analysis.categoryLabel}, urgency ${analysis.urgency}/100)`,
      at: createdAt,
    });
    addEvent(ticketId, {
      actorId: null,
      type: 'AI_TRIAGE',
      message: analysis.summary,
      at: plusMinutes(createdAt, 1),
      meta: {
        confidence: analysis.confidence,
        urgency: analysis.urgency,
        flags: analysis.flags,
        tags: analysis.tags,
        suggestedActions: analysis.suggestedActions,
        drivers: analysis.drivers,
        model: analysis.model,
      },
    });

    if (priorityOverridden) {
      addEvent(ticketId, {
        actorId: pick(staffActors),
        type: 'PRIORITY_CHANGED',
        message: 'priority changed',
        fromValue: analysis.priority,
        toValue: priority,
        at: plusMinutes(createdAt, int(2, 20)),
      });
    }

    if (assigneeId) {
      addEvent(ticketId, {
        actorId: null,
        type: 'ASSIGNED',
        message: `Auto-assigned — ${assignmentReasons.slice(0, 2).join('; ') || 'best available fit'}`,
        toValue: String(assigneeId),
        at: plusMinutes(createdAt, 2),
        meta: { score: assignmentScore, mode: 'AUTO', reasons: assignmentReasons },
      });
      run(
        `INSERT INTO assignment_logs (ticket_id, technician_id, score, mode, reasons, created_at) VALUES (?, ?, ?, 'AUTO', ?, ?)`,
        [ticketId, assigneeId, assignmentScore, JSON.stringify(assignmentReasons), plusMinutes(createdAt, 2)],
      );
    } else {
      addEvent(ticketId, { actorId: null, type: 'ASSIGNMENT_DEFERRED', message: 'Waiting in the manager queue for routing', at: plusMinutes(createdAt, 2) });
    }

    // Status timeline
    const timeline = [];
    if (status !== 'NEW') timeline.push('TRIAGED');
    if (assigneeId) timeline.push('ASSIGNED');
    if (['IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED'].includes(status)) timeline.push('IN_PROGRESS');
    if (status === 'ON_HOLD') timeline.push('ON_HOLD');
    if (status === 'RESOLVED' || status === 'CLOSED') timeline.push('RESOLVED');
    if (status === 'CLOSED') timeline.push('CLOSED');
    if (status === 'CANCELLED') timeline.push('CANCELLED');

    let cursor = plusMinutes(createdAt, int(3, 12));
    let previous = 'NEW';
    for (const next of timeline) {
      cursor = plusMinutes(cursor, int(20, Math.max(60, Math.round(slaWindowMinutes * 0.3))));
      addEvent(ticketId, {
        actorId: next === 'CLOSED' ? requesterId : (next === 'CANCELLED' ? requesterId : (assigneeId ?? pick(staffActors))),
        type: 'STATUS_CHANGED',
        message: next === 'RESOLVED' ? pick(RESOLUTION_NOTES) : `Status moved to ${next.replace(/_/g, ' ').toLowerCase()}`,
        fromValue: previous,
        toValue: next,
        at: cursor,
      });
      previous = next;
    }

    if (breached || openBreached) {
      addEvent(ticketId, {
        actorId: null,
        type: 'SLA_BREACH',
        message: 'SLA target passed without resolution',
        toValue: 'BREACHED',
        at: slaDueAt,
      });
    }

    // 7. Conversation.
    if (assigneeId && chance(0.75)) {
      addComment(ticketId, {
        authorId: assigneeId,
        body: pick(STAFF_REPLIES),
        at: plusMinutes(firstResponseAt, int(1, 30)),
      });
    }
    if (chance(0.35)) {
      addComment(ticketId, {
        authorId: pick(staffActors),
        body: pick(INTERNAL_NOTES),
        internal: true,
        at: plusMinutes(createdAt, int(30, 240)),
      });
    }
    if (isFinished && chance(0.45)) {
      addComment(ticketId, {
        authorId: requesterId,
        body: pick(REQUESTER_REPLIES),
        at: plusMinutes(resolvedAt, int(30, 900)),
      });
    }

    // 8. Photos (report + proof of resolution).
    const image = images[category] ?? images.other;
    if (chance(0.7)) {
      addAttachment(ticketId, { uploaderId: requesterId, image, phase: 'REPORT', at: plusMinutes(createdAt, 1) });
      addEvent(ticketId, { actorId: requesterId, type: 'ATTACHMENT', message: 'Uploaded 1 file', at: plusMinutes(createdAt, 1) });
    }
    if (isFinished && chance(0.5)) {
      addAttachment(ticketId, { uploaderId: assigneeId, image: images[category] ?? images.other, phase: 'RESOLUTION', at: plusMinutes(resolvedAt, 5) });
      addEvent(ticketId, { actorId: assigneeId, type: 'ATTACHMENT', message: 'Uploaded 1 file as proof of resolution', at: plusMinutes(resolvedAt, 5) });
    }

    // 9. First response stamp.
    if (status !== 'NEW') {
      run('UPDATE tickets SET first_response_at = ?, resolved_at = ?, closed_at = ? WHERE id = ?', [
        firstResponseAt,
        resolvedAt,
        closedAt,
        ticketId,
      ]);
    }

    index += 1;
  }

  // ------------------------------------------------------------------------
  // Notifications: a believable unread inbox for the demo personas.
  // ------------------------------------------------------------------------
  console.log('• Generating notifications…');
  const recent = all(
    `SELECT t.id, t.code, t.title, t.priority, t.status, t.assignee_id, t.requester_id, t.sla_due_at, t.created_at
       FROM tickets t ORDER BY t.created_at DESC LIMIT 14`,
  );

  for (const ticket of recent) {
    const isSevere = ticket.priority === 'CRITICAL' || ticket.priority === 'HIGH';
    if (ticket.assignee_id) {
      run(
        `INSERT INTO notifications (user_id, title, body, kind, ticket_id, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ticket.assignee_id,
          isSevere ? `Auto-assigned: ${ticket.code}` : `New assignment: ${ticket.code}`,
          `${ticket.title} · ${ticket.priority} priority`,
          isSevere ? 'CRITICAL' : 'INFO',
          ticket.id,
          `/tickets/${ticket.id}`,
          chance(0.35) ? 1 : 0,
          plusMinutes(ticket.created_at, 3),
        ],
      );
    }
    run(
      `INSERT INTO notifications (user_id, title, body, kind, ticket_id, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ticket.requester_id,
        `${ticket.code} is now ${String(ticket.status).replace(/_/g, ' ').toLowerCase()}`,
        'Track progress and reply from the ticket page.',
        'INFO',
        ticket.id,
        `/tickets/${ticket.id}`,
        chance(0.5) ? 1 : 0,
        plusMinutes(ticket.created_at, 25),
      ],
    );
  }

  const breachedTickets = all(`SELECT id, code, title, priority FROM tickets WHERE sla_breached = 1 LIMIT 5`);
  for (const ticket of breachedTickets) {
    for (const managerId of [...user.managers, ...user.admins]) {
      run(
        `INSERT INTO notifications (user_id, title, body, kind, ticket_id, link, is_read, created_at) VALUES (?, ?, ?, 'CRITICAL', ?, ?, 0, ?)`,
        [managerId, `⏰ SLA breached on ${ticket.code}`, `${ticket.priority} priority: ${ticket.title}`, ticket.id, `/tickets/${ticket.id}`, minutesAgo(int(10, 600))],
      );
    }
  }

  // Always leave the admin with a couple of unread items so the bell badge shows.
  run(
    `INSERT INTO notifications (user_id, title, body, kind, is_read, created_at) VALUES (?, ?, ?, 'INFO', 0, ?)`,
    [user.admins[0], 'Welcome to FixFlow 👋', 'This demo workspace is seeded with 3 weeks of maintenance history. Explore the dashboard, the SLA board and the AI triage panel.', minutesAgo(5)],
  );

  // ------------------------------------------------------------------------
  const summary = {
    users: Number(scalar('SELECT COUNT(*) FROM users') ?? 0),
    technicians: Number(scalar(`SELECT COUNT(*) FROM users WHERE role = 'TECHNICIAN'`) ?? 0),
    categories: Number(scalar('SELECT COUNT(*) FROM categories') ?? 0),
    locations: Number(scalar('SELECT COUNT(*) FROM locations') ?? 0),
    tickets: Number(scalar('SELECT COUNT(*) FROM tickets') ?? 0),
    resolved: resolvedCount,
    breached: breachedCount,
    comments: Number(scalar('SELECT COUNT(*) FROM comments') ?? 0),
    events: Number(scalar('SELECT COUNT(*) FROM ticket_events') ?? 0),
    attachments: Number(scalar('SELECT COUNT(*) FROM ticket_attachments') ?? 0),
    notifications: Number(scalar('SELECT COUNT(*) FROM notifications') ?? 0),
  };

  console.log('\n  ✅ Seed complete\n');
  for (const [key, value] of Object.entries(summary)) {
    console.log(`     ${String(key).padEnd(14)} ${value}`);
  }
  console.log('\n  Sign in with any of these (password: FixFlow123!):');
  console.log('     admin@fixflow.dev      → ADMIN');
  console.log('     manager@fixflow.dev    → MANAGER');
  console.log('     tech.electrical@fixflow.dev → TECHNICIAN');
  console.log('     hannah@fixflow.dev     → REQUESTER\n');
}

main();
