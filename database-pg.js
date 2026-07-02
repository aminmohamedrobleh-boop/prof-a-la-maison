const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initialiserDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS utilisateurs (
      id SERIAL PRIMARY KEY,
      prenom TEXT NOT NULL,
      nom TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      telephone TEXT,
      mot_de_passe TEXT NOT NULL,
      type TEXT NOT NULL,
      region TEXT,
      date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS professeurs (
      id SERIAL PRIMARY KEY,
      utilisateur_id INTEGER REFERENCES utilisateurs(id),
      matiere TEXT,
      niveau TEXT,
      tarif INTEGER,
      experience INTEGER,
      bio TEXT,
      disponibilites TEXT,
      document TEXT,
      photo TEXT,
      verifie INTEGER DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservations (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER REFERENCES utilisateurs(id),
      professeur_id INTEGER REFERENCES professeurs(id),
      date TEXT,
      heure TEXT,
      duree INTEGER,
      statut TEXT DEFAULT 'en attente',
      date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Base de données PostgreSQL initialisée !');
}

initialiserDB();

module.exports = pool;