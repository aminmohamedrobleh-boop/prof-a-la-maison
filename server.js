const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const db = require('./database');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// ===== INSCRIPTION =====
app.post('/api/inscription', (req, res) => {
  const { prenom, nom, email, telephone, mot_de_passe, type, region, matiere, niveau, tarif, experience, bio } = req.body;

  const emailExiste = db.prepare('SELECT * FROM utilisateurs WHERE email = ?').get(email);
  if (emailExiste) {
    return res.status(400).json({ erreur: 'Cet email est déjà utilisé.' });
  }

  const motDePasseChiffre = bcrypt.hashSync(mot_de_passe, 10);

  const insertion = db.prepare(`
    INSERT INTO utilisateurs (prenom, nom, email, telephone, mot_de_passe, type, region)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const resultat = insertion.run(prenom, nom, email, telephone, motDePasseChiffre, type, region);

  if (type === 'prof') {
    db.prepare(`
      INSERT INTO professeurs (utilisateur_id, matiere, niveau, tarif, experience, bio, verifie)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(resultat.lastInsertRowid, matiere, niveau, tarif, experience, bio);
  }

  res.json({ message: 'Compte créé avec succès !' });
});

// ===== CONNEXION =====
app.post('/api/connexion', (req, res) => {
  const { email, mot_de_passe } = req.body;

  const utilisateur = db.prepare('SELECT * FROM utilisateurs WHERE email = ?').get(email);
  if (!utilisateur) {
    return res.status(400).json({ erreur: 'Email ou mot de passe incorrect.' });
  }

  const motDePasseValide = bcrypt.compareSync(mot_de_passe, utilisateur.mot_de_passe);
  if (!motDePasseValide) {
    return res.status(400).json({ erreur: 'Email ou mot de passe incorrect.' });
  }

  if (utilisateur.type === 'prof') {
    const prof = db.prepare('SELECT * FROM professeurs WHERE utilisateur_id = ?').get(utilisateur.id);
    if (prof && prof.verifie === 0) {
      return res.status(403).json({
        erreur: 'en_attente',
        message: 'Votre compte est en cours de validation par notre équipe. Vous recevrez une confirmation sous 24h.'
      });
    }
  }

  const token = jwt.sign(
    { id: utilisateur.id, type: utilisateur.type },
    'secret_prof_maison',
    { expiresIn: '7d' }
  );

  res.json({
    message: 'Connexion réussie !',
    token,
    utilisateur: {
      id: utilisateur.id,
      prenom: utilisateur.prenom,
      nom: utilisateur.nom,
      type: utilisateur.type
    }
  });
});

// ===== LISTE DES PROFS =====
app.get('/api/professeurs', (req, res) => {
  const profs = db.prepare(`
    SELECT u.prenom, u.nom, u.region, p.*
    FROM professeurs p
    JOIN utilisateurs u ON p.utilisateur_id = u.id
  `).all();

  res.json(profs);
});

// ===== RÉSERVATION =====
app.post('/api/reservation', (req, res) => {
  const { parent_id, professeur_id, date, heure, duree } = req.body;

  if (!parent_id || !date || !heure) {
    return res.status(400).json({ erreur: 'Informations manquantes.' });
  }

  db.prepare(`
    INSERT INTO reservations (parent_id, professeur_id, date, heure, duree)
    VALUES (?, ?, ?, ?, ?)
  `).run(parent_id, professeur_id, date, heure, duree);

  res.json({ message: 'Réservation créée avec succès !' });
});

// ===== MES RÉSERVATIONS =====
app.get('/api/mes-reservations/:parent_id', (req, res) => {
  const reservations = db.prepare(`
    SELECT r.*, u.prenom, u.nom
    FROM reservations r
    JOIN utilisateurs u ON r.professeur_id = u.id
    WHERE r.parent_id = ?
    ORDER BY r.date_creation DESC
  `).all(req.params.parent_id);

  res.json(reservations);
});

// ===== DEMANDES PROF =====
app.get('/api/demandes-prof/:prof_id', (req, res) => {
  const demandes = db.prepare(`
    SELECT r.*, u.prenom as parent_prenom, u.nom as parent_nom
    FROM reservations r
    JOIN utilisateurs u ON r.parent_id = u.id
    WHERE r.professeur_id = ?
    ORDER BY r.date_creation DESC
  `).all(req.params.prof_id);

  res.json(demandes);
});

// ===== CHANGER STATUT RÉSERVATION =====
app.put('/api/reservation/:id/statut', (req, res) => {
  const { statut } = req.body;

  db.prepare(`
    UPDATE reservations SET statut = ? WHERE id = ?
  `).run(statut, req.params.id);

  res.json({ message: 'Statut mis à jour !' });
});

// ===== ADMIN - LISTE PROFS =====
app.get('/api/admin/professeurs', (req, res) => {
  const profs = db.prepare(`
    SELECT u.prenom, u.nom, u.email, u.telephone, u.region,
           p.id as prof_id, p.matiere, p.niveau, p.tarif, p.experience, p.bio, p.verifie
    FROM professeurs p
    JOIN utilisateurs u ON p.utilisateur_id = u.id
    ORDER BY p.verifie ASC, u.date_inscription DESC
  `).all();

  res.json(profs);
});

// ===== ADMIN - VALIDER PROF =====
app.put('/api/admin/valider-prof/:id', (req, res) => {
  const { verifie } = req.body;

  db.prepare(`
    UPDATE professeurs SET verifie = ? WHERE id = ?
  `).run(verifie, req.params.id);

  res.json({ message: 'Statut mis à jour !' });
});

// ===== PROFS VÉRIFIÉS POUR PAGE D'ACCUEIL =====
app.get('/api/professeurs-verifies', (req, res) => {
  const profs = db.prepare(`
    SELECT u.prenom, u.nom, u.region,
           p.id as prof_id, p.matiere, p.niveau, p.tarif, p.experience, p.verifie
    FROM professeurs p
    JOIN utilisateurs u ON p.utilisateur_id = u.id
    WHERE p.verifie = 1
  `).all();

  res.json(profs);
});

// ===== PARAMÈTRES PROF =====
app.put('/api/prof/parametres/:id', (req, res) => {
  const { prenom, nom, telephone, region, matiere, niveau, tarif, experience, bio, disponibilites } = req.body;

  db.prepare(`
    UPDATE utilisateurs SET prenom = ?, nom = ?, telephone = ?, region = ?
    WHERE id = ?
  `).run(prenom, nom, telephone, region, req.params.id);

  db.prepare(`
    UPDATE professeurs SET matiere = ?, niveau = ?, tarif = ?, experience = ?, bio = ?, disponibilites = ?
    WHERE utilisateur_id = ?
  `).run(matiere, niveau, tarif, experience, bio, JSON.stringify(disponibilites), req.params.id);

  res.json({ message: 'Paramètres mis à jour !' });
});

// ===== PROFIL PROF =====
app.get('/api/prof/profil/:id', (req, res) => {
  const profil = db.prepare(`
    SELECT u.prenom, u.nom, u.email, u.telephone, u.region,
           p.matiere, p.niveau, p.tarif, p.experience, p.bio, p.disponibilites, p.verifie
    FROM professeurs p
    JOIN utilisateurs u ON p.utilisateur_id = u.id
    WHERE u.id = ?
  `).get(req.params.id);

  res.json(profil);
});

// Route de test
app.get('/api/test', (req, res) => {
  res.json({ message: 'Serveur Prof à la Maison fonctionne !' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});