import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'generated/prisma/client';
import { Pool } from 'pg';
import { HashingService } from 'src/common/hashing/hashing.service';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const hashingService = new HashingService();

async function main() {
  console.log('=== STARTING DATABASE SEEDING ===');

  // ========================================================
  // 1. SEED: AKUN ADMIN KESISWAAN
  // ========================================================
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@gmail.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';

  const existingAdmin = await prisma.account.findUnique({ where: { email } });

  const hashedPassword = await hashingService.hash(password);

  if (existingAdmin) {
    console.log(
      `[Admin] Akun admin dengan email ${email} sudah ada, skip seed.`,
    );
  } else {
    const admin = await prisma.account.create({
      data: {
        email,
        passwordHash: hashedPassword,
        role: 'ADMIN_KESISWAAN',
        isVerified: true,
      },
    });
    console.log('[Admin] Akun ADMIN_KESISWAAN berhasil dibuat:', admin.email);
    console.log(
      '[Admin] Login pertama kali lewat POST /auth/otp/request dengan email ini.',
    );
  }

  // ========================================================
  // 2. SEED: SYSTEM SETTINGS (SINGLETON)
  // ========================================================
  // Cek apakah sudah ada pengaturan sistem yang tersimpan
  const existingSetting = await prisma.systemSetting.findFirst();

  if (existingSetting) {
    console.log(
      `[Setting] SystemSetting sudah ada (Angkatan: ${existingSetting.currentTopAngkatan}, Tahun Ajaran: ${existingSetting.currentAcademicYear}), skip seed.`,
    );
  } else {
    const setting = await prisma.systemSetting.create({
      data: {
        currentTopAngkatan: 33,
        currentAcademicYear: '2026/2027',
      },
    });
    console.log(
      `[Setting] SystemSetting awal berhasil dibuat! (Angkatan: ${setting.currentTopAngkatan}, Tahun Ajaran: ${setting.currentAcademicYear})`,
    );
  }

  console.log('=== SEEDING COMPLETED SUCCESSFULLY ===');
}

main()
  .catch((e) => {
    console.error('Error saat menjalankan seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
