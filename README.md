# 3dviewerLAB — 3D Viewer Editor

Visionneuse 3D desktop (Windows / macOS) pour modèles **STEP, OBJ, FBX**.
Stack : Electron + Vite + Three.js. STEP via OpenCascade WASM (`occt-import-js`).

## Lancer en dev
```bash
npm install
npm run dev
```
Fenêtre Electron + hot-reload Vite.

## Packager
```bash
npm run dist:win    # installeur Windows (NSIS)
npm run dist:mac    # DMG macOS
```

## Fonctionnement
- **Drag & drop** un fichier `.obj / .fbx / .step / .stp` (ou bouton *Browse*).
- Le viewer **s'adapte au modèle** : recadrage caméra, échelle de la grille, distance des lumières et plans de clipping dérivés de la bounding box.
- **Cotes animées** : largeur / hauteur / profondeur se dessinent comme des barres de rechargement (staggered, easeOutCubic), la valeur défile en montant. Onglet `IMPACT` = cotes visibles, `VIEW DETAILS` = masquées.
- Panneau gauche : arbre des objets (sélection + visibilité). Panneau droit : infos (format, vertices, faces, dimensions) + formats d'export.
- Sélecteur d'unités (mm / cm / m / in) en bas — recalcule cotes + panneau.

## Architecture
```
electron/      main.js (fenêtre, dialog open), preload.js (IPC sécurisé)
src/
  main.js              orchestration renderer (intake fichier, wiring UI)
  viewer/
    Viewer.js          scène Three.js + fit adaptatif au modèle
    loaders.js         OBJ / FBX / STEP(occt-wasm) → Object3D
    Dimensions.js      overlay SVG cotes animées (re-projection / frame)
  ui/
    Tree.js            arbre objets
    InfoPanel.js       infos + export + meshStats()
  styles.css           thème dark "3dviewerLAB"
```

## TODO / pas encore fait
- **C4D** : format propriétaire Maxon, aucun loader JS open-source. Skippé (cf. décision projet). Piste future : conversion C4D→FBX via CLI Cinema 4D si installé.
- Pipeline **export** réel (STL/PDF/CSV) — actuellement placeholder.
- Boutons SAVE / SAVE AS.
```
