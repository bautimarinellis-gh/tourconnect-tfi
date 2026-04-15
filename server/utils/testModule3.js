const mongoose = require('mongoose');
const dotenv = require('dotenv');

const path = require('path');
dotenv.config({ path: path.join(__dirname, '../../.env') });

const {
  crearMayorista,
  getMayoristas,
} = require('../controllers/adminController');

async function testMongooseTransactions() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(' Conectado a MongoDB');

    // Simulate Express req/res
    const req = {
      body: {
        nombre: 'Test Mayorista ' + Date.now(),
        razon_social: 'Test SRL',
        telefono: '12345678',
        email: 'test' + Date.now() + '@example.com',
        nombre_usuario: 'Admin Test'
      }
    };
    
    let responseData = null;
    let statusCode = null;

    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        responseData = data;
        return res;
      }
    };

    const next = (err) => {
      if (err) {
        console.error(' [Error next()] ->', err.message);
      }
    };

    console.log(' Intentando crear mayorista con transacciones...');
    await crearMayorista(req, res, next);
    
    if (responseData) {
      console.log(' Respuesta de crear:', statusCode, responseData);
    }

    console.log('\n Intentando obtener listado de mayoristas...');
    const reqList = {};
    const resList = {
      json: (data) => console.log(' Respuesta listado:', JSON.stringify(data, null, 2))
    };
    await getMayoristas(reqList, resList, next);


  } catch (error) {
    console.error(' Error en test:', error);
  } finally {
    await mongoose.disconnect();
    console.log(' Desconectado de MongoDB');
  }
}

testMongooseTransactions();
