const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const pool = require('./database-pg');
const { Resend } = require('resend');

dotenv.config();

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// ===== INSCRIPTION =====
app.post('/api/inscription', async (req, res) => {
  const { prenom, nom, email, telephone, mot_de_passe, type, region, matiere, niveau, tarif, experience, bio } = req.body;

  try {
    const emailExiste = await pool.query('SELECT * FROM utilisateurs WHERE email = $1', [email]);
    if (emailExiste.rows.length > 0) {
      return res.status(400).json({ erreur: 'Cet email est déjà utilisé.' });
    }

    const motDePasseChiffre = bcrypt.hashSync(mot_de_passe, 10);

    const resultat = await pool.query(`
      INSERT INTO utilisateurs (prenom, nom, email, telephone, mot_de_passe, type, region)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
    `, [prenom, nom, email, telephone, motDePasseChiffre, type, region]);

    if (type === 'prof') {
      await pool.query(`
        INSERT INTO professeurs (utilisateur_id, matiere, niveau, tarif, experience, bio, verifie)
        VALUES ($1, $2, $3, $4, $5, $6, 0)
      `, [resultat.rows[0].id, matiere, niveau, tarif, experience, bio]);
    }

    res.json({ message: 'Compte créé avec succès !' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

// ===== CONNEXION =====
app.post('/api/connexion', async (req, res) => {
  const { email, mot_de_passe } = req.body;

  try {
    const result = await pool.query('SELECT * FROM utilisateurs WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ erreur: 'Email ou mot de passe incorrect.' });
    }

    const utilisateur = result.rows[0];
    const motDePasseValide = bcrypt.compareSync(mot_de_passe, utilisateur.mot_de_passe);
    if (!motDePasseValide) {
      return res.status(400).json({ erreur: 'Email ou mot de passe incorrect.' });
    }

    if (utilisateur.type === 'prof') {
      const prof = await pool.query('SELECT * FROM professeurs WHERE utilisateur_id = $1', [utilisateur.id]);
      if (prof.rows.length > 0 && prof.rows[0].verifie === 0) {
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

// ===== LISTE DES PROFS =====
app.get('/api/professeurs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.prenom, u.nom, u.region, p.*
      FROM professeurs p
      JOIN utilisateurs u ON p.utilisateur_id = u.id
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

// ===== RÉSERVATION =====
app.post('/api/reservation', async (req, res) => {
  const { parent_id, professeur_id, date, heure, duree } = req.body;

  if (!parent_id || !date || !heure) {
    return res.status(400).json({ erreur: 'Informations manquantes.' });
  }

  try {
    await pool.query(`
      INSERT INTO reservations (parent_id, professeur_id, date, heure, duree)
      VALUES ($1, $2, $3, $4, $5)
    `, [parent_id, professeur_id, date, heure, duree]);

    res.json({ message: 'Réservation créée avec succès !' });
  } catch (err) {
    res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

// ===== MES RÉSERVATIONS =====
app.get('/api/mes-reservations/:parent_id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.prenom, u.nom
      FROM reservations r
      JOIN utilisateurs u ON r.professeur_id = u.id
      WHERE r.parent_id = $1
      ORDER BY r.date_creation DESC
    `, [req.params.parent_id]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

// ===== DEMANDES PROF =====
app.get('/api/demandes-prof/:prof_id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.prenom as parent_prenom, u.nom as parent_nom
      FROM reservations r
      JOIN utilisateurs u ON r.parent_id = u.id
      WHERE r.professeur_id = $1
      ORDER BY r.date_creation DESC
    `, [req.params.prof_id]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

// ===== CHANGER STATUT RÉSERVATION =====
app.put('/api/reservation/:id/statut', async (req, res) => {
  const { statut } = req.body;

  try {
    await pool.query('UPDATE reservations SET statut = $1 WHERE id = $2', [statut, req.params.id]);
    res.json({ message: 'Statut mis à jour !' });
  } catch (err) {
    res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

// ===== ADMIN - LISTE PROFS =====
app.get('/api/admin/professeurs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.prenom, u.nom, u.email, u.telephone, u.region,
             p.id as prof_id, p.matiere, p.niveau, p.tarif, p.experience, p.bio, p.verifie
      FROM professeurs p
      JOIN utilisateurs u ON p.utilisateur_id = u.id
      ORDER BY p.verifie ASC, u.date_inscription DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

// ===== ADMIN - VALIDER PROF =====
app.put('/api/admin/valider-prof/:id', async (req, res) => {
  const { verifie } = req.body;

  try {
    await pool.query('UPDATE professeurs SET verifie = $1 WHERE id = $2', [verifie, req.params.id]);
    res.json({ message: 'Statut mis à jour !' });
  } catch (err) {
    res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

// ===== PROFS VÉRIFIÉS =====
app.get('/api/professeurs-verifies', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.prenom, u.nom, u.region,
             p.id as prof_id, p.matiere, p.niveau, p.tarif, p.experience, p.verifie
      FROM professeurs p
      JOIN utilisateurs u ON p.utilisateur_id = u.id
      WHERE p.verifie = 1
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

// ===== PARAMÈTRES PROF =====
app.put('/api/prof/parametres/:id', async (req, res) => {
  const { prenom, nom, telephone, region, matiere, niveau, tarif, experience, bio, disponibilites } = req.body;

  try {
    await pool.query(`
      UPDATE utilisateurs SET prenom = $1, nom = $2, telephone = $3, region = $4 WHERE id = $5
    `, [prenom, nom, telephone, region, req.params.id]);

    await pool.query(`
      UPDATE professeurs SET matiere = $1, niveau = $2, tarif = $3, experience = $4, bio = $5, disponibilites = $6
      WHERE utilisateur_id = $7
    `, [matiere, niveau, tarif, experience, bio, JSON.stringify(disponibilites), req.params.id]);

    res.json({ message: 'Paramètres mis à jour !' });
  } catch (err) {
    res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

// ===== PROFIL PROF =====
app.get('/api/prof/profil/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.prenom, u.nom, u.email, u.telephone, u.region,
             p.matiere, p.niveau, p.tarif, p.experience, p.bio, p.disponibilites, p.verifie
      FROM professeurs p
      JOIN utilisateurs u ON p.utilisateur_id = u.id
      WHERE u.id = $1
    `, [req.params.id]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ erreur: 'Erreur serveur.' });
  }
});

// ===== MOT DE PASSE OUBLIÉ =====
app.post('/api/mot-de-passe-oublie', async (req, res) => {
  const { email } = req.body;

  try {
    const result = await pool.query('SELECT * FROM utilisateurs WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({ erreur: 'Aucun compte trouvé avec cet email.' });
    }

    const utilisateur = result.rows[0];

    const token = jwt.sign(
      { id: utilisateur.id, email: utilisateur.email },
      'secret_reset_mdp',
      { expiresIn: '30m' }
    );

    const lien = `${process.env.URL_SITE}/reset-password.html?token=${token}`;

    await resend.emails.send({
      from: 'Prof à la Maison <onboarding@resend.dev>',
      to: email,
      subject: 'Réinitialisation de votre mot de passe',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #534AB7;">Prof à la Maison Djibouti</h2>
          <p>Bonjour ${utilisateur.prenom},</p>
          <p>Vous avez demandé à réinitialiser votre mot de passe.</p>
          <p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
          <a href="${lien}" style="background:#534AB7; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; display:inline-block; margin:16px 0;">
            Réinitialiser mon mot de passe
          </a>
          <p style="color:#777; font-size:13px;">Ce lien expire dans 30 minutes.</p>
          <p style="color:#777; font-size:13px;">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
        </div>
      `
    });

    res.json({ message: 'Email envoyé avec succès !' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ erreur: 'Erreur lors de l\'envoi de l\'email.' });
  }
});

// ===== RÉINITIALISER MOT DE PASSE =====
app.post('/api/reset-password', async (req, res) => {
  const { token, nouveau_mot_de_passe } = req.body;

  try {
    const decoded = jwt.verify(token, 'secret_reset_mdp');
    const motDePasseChiffre = bcrypt.hashSync(nouveau_mot_de_passe, 10);

    await pool.query(
      'UPDATE utilisateurs SET mot_de_passe = $1 WHERE id = $2',
      [motDePasseChiffre, decoded.id]
    );

    res.json({ message: 'Mot de passe mis à jour avec succès !' });

  } catch (err) {
    res.status(400).json({ erreur: 'Lien invalide ou expiré.' });
  }
});

// Route de test
app.get('/api/test', (req, res) => {
  res.json({ message: 'Serveur Prof à la Maison fonctionne !' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});