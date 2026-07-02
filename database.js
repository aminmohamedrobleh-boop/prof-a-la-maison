const Database = require('better-sqlite3');

// Créer la base de données
const db = new Database('profalamaison.db');

// Désactiver les foreign keys pour éviter les erreurs
db.pragma('foreign_keys = OFF');

// Créer la table utilisateurs
db.exec(`
  CREATE TABLE IF NOT EXISTS utilisateurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prenom TEXT NOT NULL,
    nom TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    telephone TEXT,
    mot_de_passe TEXT NOT NULL,
    type TEXT NOT NULL,
    region TEXT,
    date_inscription DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Créer la table professeurs
db.exec(`
  CREATE TABLE IF NOT EXISTS professeurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    utilisateur_id INTEGER,
    matiere TEXT,
    niveau TEXT,
    tarif INTEGER,
    experience INTEGER,
    bio TEXT,
    disponibilites TEXT,
    document TEXT,
    photo TEXT,
    verifie INTEGER DEFAULT 0,
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
  )
`);

// Créer la table réservations
db.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    professeur_id INTEGER,
    date TEXT,
    heure TEXT,
    duree INTEGER,
    statut TEXT DEFAULT 'en attente',
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES utilisateurs(id),
    FOREIGN KEY (professeur_id) REFERENCES professeurs(id)
  )
`);

console.log('Base de données créée avec succès !');

module.exports = db;