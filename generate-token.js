import jwt from 'jsonwebtoken';

const secret = 'super_secreto_largo';

// Token con ObjectId válido para MongoDB
const payload = {
  sub: '69bec5d853b18a1b217dc0e3', // MongoDB ObjectId válido
  email: 'christiansilvap04@gmail.com',
  name: 'cristian silva',
  provider: 'google'
};

const token = jwt.sign(payload, secret);

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║              🔐 JWT TOKEN PARA TESTING                    ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log('📋 PAYLOAD:');
console.log(JSON.stringify(payload, null, 2));

console.log('\n🔑 TOKEN COMPLETO:');
console.log(token);

console.log('\n📌 USO EN POSTMAN / CURL:');
console.log('──────────────────────────────────────────────');
console.log('Header: Authorization');
console.log(`Value:  Bearer ${token}`);

console.log('\n📌 EJEMPLO DE PRUEBA (curl):');
console.log('──────────────────────────────────────────────');
console.log('curl -X DELETE "http://localhost:5000/rooms/<ROOM_ID>" \\');
console.log(`  -H "Authorization: Bearer ${token}"`);

console.log('\n⚠️  IMPORTANTE:');
console.log('──────────────────────────────────────────────');
console.log('1. Reemplaza <ROOM_ID> con el ID real de la sala');
console.log('2. El usuario con este token DEBE ser host de la sala');
console.log('3. Si no es host, recibirás: 403 ROOM_FORBIDDEN\n');

