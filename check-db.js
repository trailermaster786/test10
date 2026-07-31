const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({datasourceUrl:'file:./db/aquatrack.db'});

(async () => {
  const users = await prisma.user.findMany({select:{id:true,email:true,name:true,role:true,isActive:true}});
  console.log('USERS:', JSON.stringify(users, null, 2));
  const promos = await prisma.promoOffer.findMany();
  console.log('PROMOS:', JSON.stringify(promos, null, 2));
  await prisma.$disconnect();
})();
