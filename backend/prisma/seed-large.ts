/* eslint-disable prettier/prettier */
/**
 * Developer tool — large dataset seed for load and scaling tests.
 *
 * Wipes the database and creates 1 demo user + 5 000 faker contacts,
 * with ~10 % marked as favourites. Do NOT run in production.
 *
 * Usage: npm run seed:large
 *        (or: npx ts-node prisma/seed-large.ts)
 */
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TOTAL = 5_000;
const BATCH = 500;

async function main() {
  // Wipe slate clean
  await prisma.contact.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('password123', 12);

  const user = await prisma.user.create({
    data: {
      email: 'demo@example.com',
      passwordHash,
      displayName: 'Demo User',
    },
  });

  console.log(`Created user: ${user.email}`);

  let created = 0;
  while (created < TOTAL) {
    const batchSize = Math.min(BATCH, TOTAL - created);
    const contacts = Array.from({ length: batchSize }, () => {
      const name = faker.person.fullName();
      return {
        name,
        phone: faker.phone.number({ style: 'international' }),
        email: Math.random() > 0.4 ? faker.internet.email() : null,
        sortName: name.toLowerCase(),
        userId: user.id,
      };
    });

    await prisma.contact.createMany({ data: contacts });
    created += batchSize;
    console.log(`  Inserted ${created} / ${TOTAL}`);
  }

  // Mark ~10 % as favourites
  const firstTenPercent = await prisma.contact.findMany({
    where: { userId: user.id },
    select: { id: true },
    take: Math.floor(TOTAL * 0.1),
    orderBy: { createdAt: 'asc' },
  });

  await prisma.contact.updateMany({
    where: { id: { in: firstTenPercent.map(({ id }) => id) } },
    data: { isFavourite: true },
  });

  console.log(`Seeded ${TOTAL} contacts (${firstTenPercent.length} favourited) for ${user.displayName}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
