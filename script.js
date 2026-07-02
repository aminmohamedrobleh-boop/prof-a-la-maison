const filtres = document.querySelectorAll('.filtre');
const cartes = document.querySelectorAll('.carte-prof');

// Filtres par boutons
filtres.forEach(function(bouton) {
  bouton.addEventListener('click', function() {
    filtres.forEach(function(b) { b.classList.remove('actif'); });
    bouton.classList.add('actif');

    const matiere = bouton.textContent.toLowerCase().trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, '-');

    cartes.forEach(function(carte) {
      if (matiere === 'tous' || carte.dataset.matiere === matiere) {
        carte.style.display = 'block';
      } else {
        carte.style.display = 'none';
      }
    });
  });
});

// Bouton Rechercher
document.getElementById('btn-rechercher').addEventListener('click', function() {
  const matiere = document.getElementById('select-matiere').value;
  const niveau  = document.getElementById('select-niveau').value;
  const region  = document.getElementById('select-region').value;

  cartes.forEach(function(carte) {
    const okMatiere = matiere === 'tous' || carte.dataset.matiere === matiere;
    const okNiveau  = niveau === 'tous'  || carte.dataset.niveau === niveau;
    const okRegion  = region === 'tous'  || carte.dataset.region === region;

    if (okMatiere && okNiveau && okRegion) {
      carte.style.display = 'block';
    } else {
      carte.style.display = 'none';
    }
  });
});