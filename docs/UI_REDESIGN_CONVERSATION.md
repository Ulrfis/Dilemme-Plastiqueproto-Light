# UI Redesign — Interface Conversationnelle

> **Contexte** : Dilemme Plastique — tutoriel IA vocale, cible 13-18 ans, salles de classe.  
> **Objectifs** : corriger les problèmes d'espace sur mobile/tablet, ajouter un breakpoint tablette manquant, élever l'esthétique vers un registre "gaming UI / HUD".

---

## 1. Diagnostic des layouts actuels

### 1.1 Mobile (< 1024px) — problèmes identifiés

```
┌─────────────────────────────┐  ← 100dvh
│  HEADER (fixed ~50px)       │
│  [N/6] [Poursuivre] [Info]  │
├─────────────────────────────┤
│                             │
│   IMAGE  (26vh fixe)        │  ← Prend ~173px sur iPhone SE
│                             │
├─────────────────────────────┤
│  BANDE INDICES (min 50px)   │  ← Gaspillage si vide
├─────────────────────────────┤
│                             │
│  CONVERSATION (flex-1)      │  ← Seulement ~40% de l'écran
│   messages...               │     Les derniers messages
│   [compteur centré]         │     disparaissent sous le fold
│   [zone saisie]             │
└─────────────────────────────┘

Problèmes :
 ✗ Image fixe = conversation écrasée
 ✗ Bande indices vide = espace mort
 ✗ Compteur échanges au milieu de la conversation = bruit visuel
 ✗ Bouton micro 48px = trop petit comme CTA principal
 ✗ Clavier système = conversation encore plus petite
```

### 1.2 Tablette (768px–1023px) — breakpoint manquant

```
┌──────────────────────────────────┐  768px–1023px
│        (même layout que mobile)  │
│  HEADER                          │
│  IMAGE  26vh                     │
│  BANDE INDICES                   │
│  CONVERSATION                    │  ← Empilé alors que la
└──────────────────────────────────┘     largeur permettrait 2 colonnes
```

### 1.3 Desktop (≥ 1024px) — problèmes identifiés

```
┌───────────┬──────────────────────────────────┐
│           │  INFO BAR (tout dans une ligne)  │
│           │  [N/6][badges][Poursuivre][Reset] │  ← Chargé, sans hiérarchie
│  CONV     │──────────────────────────────────│
│  26%      │                                  │
│           │                                  │  ← Image à 74%
│ ← Trop   │   IMAGE (zoomable)               │     largement sufficante
│   étroit  │                                  │
│           │                                  │
└───────────┴──────────────────────────────────┘

Problèmes :
 ✗ Colonne conversation 26% = trop étroite, bulles compressées
 ✗ Info bar plate, tout au même niveau visuel
 ✗ "Nouvelle session" à côté de "Poursuivre" = confusion CTA principal/secondaire
```

---

## 2. Propositions de layout

### 2.1 Mobile — image collapsible + clues intégrées

```
État DÉVELOPPÉ (par défaut) :
┌─────────────────────────────┐
│  HEADER (compact ~44px)     │
│  [N/6 indices] [Poursuivre] │
├─────────────────────────────┤
│  IMAGE (22vh)               │
│  ┌─────────────────────┐    │
│  │ badges clues sur    │    │  ← Clues flottent SUR l'image
│  │ l'image (overlay)   │    │     libèrent la bande en dessous
│  └─────────────────────┘    │
│  [  ∧ masquer l'image  ]    │  ← Toggle chevron
├─────────────────────────────┤
│  CONVERSATION (flex-1)      │  ← Plus d'espace
│  messages...                │
│  ─────────────────────────  │
│  [⌨] [   À l'écoute…   ] [🎤]│  ← Input bar gaming
│       3/8 échanges →        │  ← Compteur HUD (discret, aligné droite)
└─────────────────────────────┘

État RÉDUIT (image cachée) :
┌─────────────────────────────┐
│  HEADER (compact ~44px)     │
├─────────────────────────────┤
│  [  ∨ voir l'image      ]   │  ← Bandeau fin pour rouvrir
├─────────────────────────────┤
│                             │
│  CONVERSATION (tout l'espace│  ← ~85% de l'écran disponible
│               disponible)   │
│                             │
└─────────────────────────────┘
```

### 2.2 Tablette (md: 768px) — split 45/55

```
┌─────────────────┬───────────────────────┐
│                 │                       │
│  IMAGE          │  HEADER CONV          │
│  (45%)          │  [N/6] [Poursuivre]   │
│                 │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
│  badges clues   │                       │
│  flottent sur   │  messages...          │
│  l'image        │                       │
│  (overlay bas)  │  (scroll interne)     │
│                 │                       │
│                 │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
│                 │  [⌨][  status  ][🎤]  │
└─────────────────┴───────────────────────┘
     768px → 1023px
```

### 2.3 Desktop (lg: ≥ 1024px) — conversation élargie + info bar structurée

```
┌──────────────┬──────────────────────────────────────────┐
│              │  ┌──────────────┬──────────────┬───────┐ │
│              │  │ [■■■■□□] 4/6 │ ADN  Végét.  │[Poursu│ │  ← 3 zones distinctes
│              │  │ progress bar │ Homme  Femme │ ivre] │ │
│  CONV        │  └──────────────┴──────────────┴───────┘ │
│  34%         │──────────────────────────────────────────│
│  (était 26%) │                                          │
│              │   IMAGE (zoomable, 66% largeur)          │
│              │                                          │
│              │                                          │
└──────────────┴──────────────────────────────────────────┘
     ≥ 1024px

Info bar — détail :
┌────────────────┬─────────────────────────┬──────────────┐
│ Progression    │ Indices trouvés          │ Actions      │
│ [4/6] ████░░  │ [✓ ADN] [✓ Végét.]  ...  │ [Poursuivre] │
│ (badge+bar)    │ (badges animés)          │ [i] ghost    │
└────────────────┴─────────────────────────┴──────────────┘
```

---

## 3. Redesign composants

### 3.1 Bouton micro — CTA principal gaming

```
État IDLE :
        ┌─ ─ ─ ─ ─┐  ← anneau pulsant (ring-primary/20, animate-pulse-ring)
      ┌─────────────┐
      │      🎤     │  ← 56px × 56px (sm: 64px)
      │   rounded-  │     bg-primary, shadow-lg
      │   full      │     plus gros qu'avant (48px)
      └─────────────┘

État RECORDING :
      ┌─────────────┐
      │      ⏹      │  ← bg-destructive, variant=destructive
      │   (stop)    │     ring rouge pulsant
      └─────────────┘

État PLAYING :
        ~~~~~~~~~~~~   ← onde sonore SVG animée (3 arcs concentriques)
      ┌─────────────┐
      │  [avatar]   │  ← Miniature avatar Peter (pas le spinner)
      │             │     bg-orange-500, anneau orange
      └─────────────┘
```

### 3.2 Zone de statut / transcription — colorée par état

```
IDLE :
┌──────────────────────────────────┐
│  Parlez ou tapez...     3/8 →   │  ← texte muted, compteur HUD droite
└──────────────────────────────────┘

RECORDING :
┌──────────────────────────────────┐  ← bg-destructive/10, border-destructive/30
│  "Je vois de la pollution..."│▌  │  ← transcript live + curseur clignotant
└──────────────────────────────────┘

PROCESSING :
┌──────────────────────────────────┐  ← bg-primary/10, border-primary/30
│  "Je vois de la pollution..."    │  ← transcript figé (en attente Whisper)
└──────────────────────────────────┘

PLAYING :
┌──────────────────────────────────┐  ← bg-orange-500/10, border-orange-400/30
│  Peter parle...  ≋≋≋            │  ← icône ondes sonores animées
└──────────────────────────────────┘
```

### 3.3 Bulles de message — gaming style

```
Avant :                    Après :
╭─────────────────╮        ╭───────────────────╮
│ Message Peter   │        │ Message Peter      │  ← rounded-xl (moins bubble)
│ texte...        │        │ texte...           │     bg-card/90, pas de shadow-lg
╰─────────────────╯        ╰───────────────────╯     fine bordure card-border/50

  ╭────────────╮              ╭──────────────╮
  │ User msg  │              │  User msg    │  ← rounded-xl rounded-tr-none
  ╰────────────╯              ╰──────────────╯     bg-primary/90
```

### 3.4 Avatar Peter — clip hexagonal

```
Avant :           Après :
  ╭────╮           ⬡
 │      │         ╱    ╲
 │  👤  │        │  👤  │   ← clip-path: polygon(50% 0%, 95% 25%, 95% 75%,
 │      │         ╲    ╱                        50% 100%, 5% 75%, 5% 25%)
  ╰────╯           ⬡
 (circle)       (hexagone)
```

### 3.5 Badges indices — style gaming séquentiel

```
Avant :                      Après :
[✓ ADN]  [✓ Végétation]      [1 ADN]  [2 Végétation]
                              ↑ numéro de découverte
 variant=default              fine bordure colorée accent
 rounded-full                 rounded-md (moins pill)
                              icon CheckCircle2 → chiffre dans pastille
```

### 3.6 Indicateur "Peter parle" — waveform mini

```
Avant :                   Après :
   [avatar bounce]         ≋ ≋ ≋  (3 barres SVG animées de hauteur variable)
   (seul visuel)           à gauche du texte "Peter parle…" dans la zone statut
                           OR au-dessus du bouton micro (zone de contrôle)
```

---

## 4. Détection clavier virtuel (mobile)

```
visualViewport API :

window.visualViewport.addEventListener('resize', () => {
  const viewportHeight = window.visualViewport.height;
  const windowHeight = window.innerHeight;
  const keyboardHeight = windowHeight - viewportHeight;

  if (keyboardHeight > 100) {
    // Clavier ouvert → réduire/cacher l'image automatiquement
    setImageCollapsed(true);
  } else {
    // Clavier fermé → restaurer si l'utilisateur n'avait pas manuellement réduit
    if (!userManuallyClosed) setImageCollapsed(false);
  }
});
```

---

## 5. Récapitulatif des fichiers modifiés

| Fichier | Changements |
|---|---|
| `client/src/components/TutorialScreen.tsx` | Breakpoint tablette (md), image collapsible, colonne desktop 34%, info bar restructurée |
| `client/src/components/ConversationPanel.tsx` | Bouton micro 56px, zone statut colorée, compteur HUD, bulles rounded-xl, avatar hexagonal |
| `client/src/components/ZoomableImage.tsx` | Prop pour hauteur variable (contrôlée par TutorialScreen) |

---

## 6. Ordre d'implémentation

1. **TutorialScreen** — Layout tablette (md: 2 colonnes) → gain immédiat
2. **TutorialScreen** — Image collapsible mobile + détection clavier
3. **TutorialScreen** — Desktop : colonne 34% + info bar 3 zones
4. **ConversationPanel** — Bouton micro redesigné + zone statut colorée
5. **ConversationPanel** — Compteur HUD + avatar hexagonal + bulles rounded-xl
