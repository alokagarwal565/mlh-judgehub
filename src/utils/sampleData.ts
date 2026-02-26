import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export async function createSampleData(options: { wipeExisting?: boolean } = {}) {
  const eventName = 'AceHack 5.0';
  
  if (options.wipeExisting) {
    console.log('🧹 Cleaning database...');
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
    
    // Create Default Admin
    const adminHash = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: { name: 'Admin', email: 'admin@mlh.local', passwordHash: adminHash, passwordPlain: 'admin123', role: 'ADMIN' }
    });
  } else {
    // Check if sample event already exists
    const existing = await prisma.event.findFirst({ where: { name: eventName } });
    if (existing) {
      throw new Error('A sample event (AceHack 5.0) already exists.');
    }
  }

  // ── Judges ───────────────────────────────────────────────
  const judgeData = [
    { name: 'Dr. Sarah Chen',    email: 'sarah.chen@mlh.sample',    phone: '+1-555-0101' },
    { name: 'Prof. James Liu',   email: 'james.liu@mlh.sample',     phone: '+1-555-0102' },
    { name: 'Ms. Priya Patel',   email: 'priya.patel@mlh.sample',   phone: '+1-555-0103' },
    { name: 'Mr. Alex Rivera',   email: 'alex.rivera@mlh.sample',   phone: '+1-555-0104' },
    { name: 'Dr. Emma Wilson',   email: 'emma.wilson@mlh.sample',   phone: '+1-555-0105' },
    { name: 'Dr. Robert Brown',  email: 'robert.brown@mlh.sample',  phone: '+1-555-0106' },
  ];

  for (const j of judgeData) {
    const hash = await bcrypt.hash('judge123', 10);
    await prisma.user.create({
      data: { name: j.name, email: j.email, phone: j.phone, passwordHash: hash, passwordPlain: 'judge123', role: 'JUDGE' }
    });
  }

  // ── Event ────────────────────────────────────────────────
  const event = await prisma.event.create({
    data: {
      name: eventName,
      description: `Official sample hackathon event generated on ${new Date().toLocaleDateString()}.`,
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
    const email = `team.${teamNumber}@team.sample`;
    
    const team = await prisma.user.create({
      data: {
        name: teamNames[i],
        email: email,
        passwordHash: hash,
        passwordPlain: 'team123',
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

  return event;
}
