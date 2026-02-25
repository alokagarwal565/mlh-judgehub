import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Cleaning database...');

  // Delete in reverse FK dependency order
  await prisma.stackRankVote.deleteMany();
  await prisma.trackNomination.deleteMany();
  await prisma.score.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.flag.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.rejudgeAssignment.deleteMany();
  await prisma.judgeSetProject.deleteMany();
  await prisma.judgeSet.deleteMany();
  await prisma.project.deleteMany();
  await prisma.track.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany({ where: { role: { in: ['TEAM', 'JUDGE'] } } });
  await prisma.user.deleteMany({ where: { role: 'ADMIN' } });

  console.log('✅ Database cleaned. Seeding...');

  // ── Admin ────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('admin123', 10);
  await prisma.user.create({
    data: { name: 'Admin', email: 'admin@mlh.local', passwordHash: adminHash, role: 'ADMIN' }
  });

  // ── Judges ───────────────────────────────────────────────
  const judgeData = [
    { name: 'Dr. Sarah Chen',    email: 'sarah.chen@mlh.local',    phone: '+1-555-0101' },
    { name: 'Prof. James Liu',   email: 'james.liu@mlh.local',     phone: '+1-555-0102' },
    { name: 'Ms. Priya Patel',   email: 'priya.patel@mlh.local',   phone: '+1-555-0103' },
    { name: 'Mr. Alex Rivera',   email: 'alex.rivera@mlh.local',   phone: '+1-555-0104' },
    { name: 'Dr. Emma Wilson',   email: 'emma.wilson@mlh.local',   phone: '+1-555-0105' },
    { name: 'Dr. Robert Brown',  email: 'robert.brown@mlh.local',  phone: '+1-555-0106' },
  ];

  for (const j of judgeData) {
    const hash = await bcrypt.hash('judge123', 10);
    await prisma.user.create({
      data: { name: j.name, email: j.email, phone: j.phone, passwordHash: hash, role: 'JUDGE' }
    });
  }

  // ── Event ────────────────────────────────────────────────
  const event = await prisma.event.create({
    data: {
      id: 'seed-event-1',
      name: 'MLH HackFest 2026',
      description: 'Annual hackathon with 26 teams competing across multiple tracks.',
      timePerProject: 180,
      setSize: 5,
      status: 'SETUP'
    }
  });

  // ── Tracks ───────────────────────────────────────────────
  const trackData = [
    { name: 'Best AI/ML Hack',    description: 'Most innovative use of AI or ML',      color: '#8B5CF6' },
    { name: 'Best Social Good',   description: 'Best hack addressing a social issue',   color: '#10B981' },
    { name: 'Best Design',        description: 'Most polished UI/UX',                   color: '#F59E0B' },
    { name: 'Best Beginner Hack', description: 'Best hack by first-time hackers',        color: '#EC4899' },
  ];
  for (const td of trackData) {
    await prisma.track.create({ data: { eventId: event.id, ...td } });
  }

  // ── Teams & Projects ─────────────────────────────────────
  const teamNames = [
    'CyberNinjas', 'DataWizards', 'PixelPioneers', 'CodeCrafters', 'ByteBusters',
    'NeuralNet', 'HackHeroes', 'QuantumLeap', 'DevDynamos', 'CloudChasers',
    'LogicNodes', 'MetaSprites', 'AlphaGears', 'StormCoders', 'NeonBits',
    'ZeroLatency', 'HyperLoop', 'SyntaxError', 'BitFlippers', 'LaunchPad',
    'RocketBytes', 'InfiniteLoop', 'CodeStorm', 'TurboStack', 'WebWizards', 'OpenSource'
  ];

  const projectTitles = [
    'AI-Powered Study Buddy', 'Real-Time Sign Language Translator', 'Carbon Footprint Tracker',
    'Smart Campus Navigation', 'Mental Health Companion Bot', 'Blockchain Voting System',
    'AR Campus Tour', 'Food Waste Reducer App', 'Peer Tutoring Marketplace', 'Emergency Alert Network',
    'Accessibility Toolkit', 'Sleep Pattern Analyzer', 'Micro-Investment Platform', 'Local Hero Finder',
    'EV Charging Optimizer', 'Wildfire Prediction Model', 'Adaptive Learning Engine', 'Community Skill Exchange',
    'Digital Twin City', 'Noise Pollution Monitor', 'Smart Energy Dashboard', 'Code Review AI',
    'Medical Image Annotator', 'Supply Chain Tracker', 'Open Data Explorer', 'Inclusive Job Board'
  ];

  for (let i = 0; i < 26; i++) {
    const hash = await bcrypt.hash('team123', 10);
    const teamNumber = `${i + 1}`;
    const team = await prisma.user.create({
      data: {
        name: teamNames[i],
        email: `team${teamNumber}@event.local`,
        passwordHash: hash,
        role: 'TEAM',
        phone: `+1-555-${String(1000 + i + 1).padStart(4, '0')}`
      }
    });

    await prisma.project.create({
      data: {
        eventId: event.id,
        teamId: team.id,
        title: projectTitles[i],
        description: `An innovative hackathon project by ${teamNames[i]}.`,
        roomNumber: `Room ${101 + i}`,
        teamNumber: teamNumber,
        leaderName: `Leader ${i + 1}`
      }
    });
  }

  console.log('\n✅ Seed completed!');
  console.log('─────────────────────────────────────────');
  console.log('Admin  : admin@mlh.local          / admin123');
  console.log('Judges : sarah.chen@mlh.local     / judge123');
  console.log('         james.liu@mlh.local      / judge123');
  console.log('         priya.patel@mlh.local    / judge123');
  console.log('         alex.rivera@mlh.local    / judge123');
  console.log('         emma.wilson@mlh.local    / judge123');
  console.log('         robert.brown@mlh.local   / judge123');
  console.log('Teams  : team1@event.local … team26@event.local / team123');
  console.log('─────────────────────────────────────────');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
