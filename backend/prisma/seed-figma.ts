/**
 * Figma design seed — runs automatically on `prisma db seed` (project init).
 *
 * Creates the demo user and upserts the five showcase contacts from the Figma
 * design spec. Avatars point to static files in frontend/public/avatars/ which
 * are served by Vite in dev and by the static file server in production.
 *
 * The Avatar component detects the `.png` extension and skips the S3 WebP
 * suffix logic (`-40.webp` / `-120.webp`) used for user-uploaded avatars.
 *
 * Usage: npx ts-node prisma/seed-figma.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'password123';
const DEMO_DISPLAY_NAME = 'Demo User';

const FIGMA_CONTACTS = [
  {
    name: 'Timothy Lewis',
    phone: '+36 01 234 5678',
    email: 'timothy.lewis@example.com',
    avatar: '/avatars/Timothy.png',
    favourite: true,
  },
  {
    name: 'Sarah Wright',
    phone: '+36 01 234 5678',
    email: 'sarah.wright@example.com',
    avatar: '/avatars/Sarah.png',
    favourite: true,
  },
  {
    name: 'Lucy Jones',
    phone: '+36 01 234 5678',
    email: 'lucy.jones@example.com',
    avatar: '/avatars/Lucy.png',
    favourite: false,
  },
  {
    name: 'Jake Perez',
    phone: '+36 01 234 5678',
    email: 'jake.perez@example.com',
    avatar: '/avatars/Jake.png',
    favourite: false,
  },
  {
    name: 'Adebayo Rodriguez',
    phone: '+36 01 234 5678',
    email: 'adebayo.rodriguez@example.com',
    avatar: '/avatars/Adebayo.png',
    favourite: false,
  },
] as const;

async function main() {
  // ── Ensure demo user exists ──────────────────────────────────────────────
  let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });

  if (!user) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    user = await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        passwordHash,
        displayName: DEMO_DISPLAY_NAME,
      },
    });
    console.log(`Created demo user: ${user.email}`);
  } else {
    console.log(`Using existing demo user: ${user.email}`);
  }

  // ── Upsert Figma contacts ────────────────────────────────────────────────
  let created = 0;
  let skipped = 0;

  for (const c of FIGMA_CONTACTS) {
    const existing = await prisma.contact.findFirst({
      where: { userId: user.id, name: c.name },
    });

    if (existing) {
      skipped++;
      console.log(`  ↩  skipped (already exists): ${c.name}`);
      continue;
    }

    await prisma.contact.create({
      data: {
        name: c.name,
        phone: c.phone,
        email: c.email,
        sortName: c.name.toLowerCase(),
        avatarUrl: c.avatar,
        isFavourite: c.favourite,
        userId: user.id,
      },
    });

    created++;
    console.log(`  ✓  created: ${c.name}${c.favourite ? ' ★' : ''}`);
  }

  console.log(`\nDone — ${created} created, ${skipped} skipped.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
