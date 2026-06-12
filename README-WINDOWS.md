# EPMI Gaming v12 stable

## Installation Windows
1. Dézippe le dossier.
2. Double-clique sur `INSTALLER.bat`.
3. Double-clique sur `LANCER.bat`.
4. Ouvre http://localhost:5173

## Comptes de test
- Admin : admin@epmi-gaming.local / admin123
- Membre : membre@epmi-gaming.local / membre123

## Corrections v12
- Image d’accueil remplacée par le visuel EPMI Gaming fourni.
- Correction structurelle du crash de navigation : passage en HashRouter pour éviter les pages blanches au changement ou refresh de route.
- Suppression de la page erreur qui masquait le vrai problème.
- Sécurisation de l’affichage des données venant du backend : tableaux/objets ne cassent plus React.
- Particules lumineuses flottantes orientées gaming/esport.
- Build frontend testé et backend vérifié.
