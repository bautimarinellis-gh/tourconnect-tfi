const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Usuario = require('../models/Usuario');

dotenv.config({ path: '../.env' });

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Conectado a MongoDB para seed...');

    const adminEmail = 'admin@tourconnect.com';
    const password_hash = await Usuario.hashPassword('Admin123!');
    const adminExists = await Usuario.findOne({ email: adminEmail });

    if (adminExists) {
      adminExists.password_hash = password_hash;
      adminExists.activo = true;
      adminExists.rol = 'admin';
      adminExists.nombre = 'Administrador TourConnect';
      await adminExists.save();
      console.log('Usuario admin actualizado correctamente.');
    } else {
      const newAdmin = new Usuario({
        nombre: 'Administrador TourConnect',
        email: adminEmail,
        password_hash,
        rol: 'admin',
        activo: true
      });
      await newAdmin.save();
      console.log('Usuario administrador creado exitosamente.');
    }
    console.log('Email: admin@tourconnect.com');
    console.log('Password: Admin123!');
    
    process.exit(0);
  } catch (error) {
    console.error('Error al crear el admin:', error);
    process.exit(1);
  }
};

seedAdmin();
