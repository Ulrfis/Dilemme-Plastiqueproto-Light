import { useEffect, useState, useMemo } from "react";

interface SuccessFeedbackProps {
  clueNames: string[];
}

// Couleurs des morceaux de plastique (couleurs vives de bouteilles)
const PLASTIC_COLORS = [
  '#00A8E8', // Bleu clair (eau)
  '#29B6F6', // Bleu bouteille
  '#4FC3F7', // Bleu clair
  '#81D4FA', // Bleu très clair
  '#B3E5FC', // Bleu pâle
  '#E1F5FE', // Bleu quasi blanc
  '#4DD0E1', // Cyan
  '#00BCD4', // Cyan foncé
  '#26C6DA', // Turquoise
  '#80DEEA', // Turquoise clair
];

// Formes des morceaux de plastique (plus de formes de débris)
const PLASTIC_SHAPES = [
  'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', // Losange
  'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)', // Hexagone
  'polygon(20% 0%, 80% 0%, 100% 20%, 100% 80%, 80% 100%, 20% 100%, 0% 80%, 0% 20%)', // Octogone
  'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)', // Carré
  'polygon(50% 0%, 100% 100%, 0% 100%)', // Triangle
  'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)', // Fragment arrondi
  'polygon(0% 20%, 60% 0%, 100% 40%, 80% 100%, 20% 80%)', // Fragment irrégulier
];

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  shape: string;
  size: number;
  rotation: number;
  velocityX: number;
  velocityY: number;
  rotationSpeed: number;
  delay: number;
}

interface PlasticBottleProps {
  isExploding: boolean;
  isShaking: boolean;
  message: string;
  clueNames: string[];
}

function PlasticBottle({ isExploding, isShaking, message, clueNames }: PlasticBottleProps) {
  // Tronquer les noms d'indices pour qu'ils tiennent dans l'étiquette
  const truncateClue = (clue: string, maxLength: number = 15) => {
    return clue.length > maxLength ? clue.substring(0, maxLength - 1) + '…' : clue;
  };

  return (
    <div
      className="relative"
      style={{
        animation: isExploding
          ? 'bottle-explode 0.3s ease-in forwards'
          : isShaking
            ? 'bottle-shake 0.08s ease-in-out infinite'
            : 'none',
        filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.3))'
      }}
    >
      {/* Bouteille de plastique réaliste en SVG */}
      <svg width="280" height="450" viewBox="0 0 200 320" className="drop-shadow-2xl">
        <defs>
          {/* Dégradé principal pour le plastique transparent */}
          <linearGradient id="bottleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0288D1" stopOpacity="0.9" />
            <stop offset="15%" stopColor="#29B6F6" stopOpacity="0.85" />
            <stop offset="35%" stopColor="#4FC3F7" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#81D4FA" stopOpacity="0.75" />
            <stop offset="65%" stopColor="#4FC3F7" stopOpacity="0.8" />
            <stop offset="85%" stopColor="#29B6F6" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0288D1" stopOpacity="0.9" />
          </linearGradient>

          {/* Dégradé pour le bouchon */}
          <linearGradient id="capGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1976D2" />
            <stop offset="30%" stopColor="#2196F3" />
            <stop offset="70%" stopColor="#1565C0" />
            <stop offset="100%" stopColor="#0D47A1" />
          </linearGradient>

          {/* Dégradé pour l'eau à l'intérieur */}
          <linearGradient id="waterGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#4FC3F7" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0288D1" stopOpacity="0.6" />
          </linearGradient>

          {/* Reflet brillant */}
          <linearGradient id="highlightGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="30%" stopColor="white" stopOpacity="0.6" />
            <stop offset="50%" stopColor="white" stopOpacity="0.8" />
            <stop offset="70%" stopColor="white" stopOpacity="0.6" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>

          {/* Filtre pour effet plastique brillant */}
          <filter id="plasticShine" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
            <feOffset in="blur" dx="2" dy="2" result="offsetBlur" />
            <feComposite in="SourceGraphic" in2="offsetBlur" operator="over" />
          </filter>

          {/* Ombre intérieure pour profondeur */}
          <filter id="innerShadow">
            <feOffset dx="0" dy="2" />
            <feGaussianBlur stdDeviation="3" result="offset-blur" />
            <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse" />
            <feFlood floodColor="black" floodOpacity="0.2" result="color" />
            <feComposite operator="in" in="color" in2="inverse" result="shadow" />
            <feComposite operator="over" in="shadow" in2="SourceGraphic" />
          </filter>
        </defs>

        {/* Ombre de la bouteille */}
        <ellipse cx="100" cy="310" rx="55" ry="8" fill="rgba(0,0,0,0.15)" />

        {/* Bouchon avec rainures */}
        <rect x="75" y="0" width="50" height="28" rx="5" fill="url(#capGradient)" />
        <rect x="78" y="4" width="44" height="3" rx="1.5" fill="rgba(255,255,255,0.3)" />
        <rect x="78" y="9" width="44" height="2" rx="1" fill="rgba(0,0,0,0.2)" />
        <rect x="78" y="13" width="44" height="2" rx="1" fill="rgba(0,0,0,0.15)" />
        <rect x="78" y="17" width="44" height="2" rx="1" fill="rgba(0,0,0,0.1)" />
        {/* Reflet sur le bouchon */}
        <rect x="80" y="2" width="15" height="22" rx="3" fill="rgba(255,255,255,0.25)" />

        {/* Goulot avec épaisseur de plastique */}
        <path d="M82 28 L82 48 L72 62 L72 78 L128 78 L128 62 L118 48 L118 28" fill="url(#bottleGradient)" />
        <path d="M85 28 L85 46 L76 58 L76 78" stroke="rgba(255,255,255,0.4)" strokeWidth="3" fill="none" strokeLinecap="round" />

        {/* Corps de la bouteille - forme principale */}
        <path
          d="M72 78 L52 112 L38 145 L38 280 Q38 302 58 302 L142 302 Q162 302 162 280 L162 145 L148 112 L128 78 Z"
          fill="url(#bottleGradient)"
          filter="url(#plasticShine)"
        />

        {/* Contour de la bouteille */}
        <path
          d="M72 78 L52 112 L38 145 L38 280 Q38 302 58 302 L142 302 Q162 302 162 280 L162 145 L148 112 L128 78 Z"
          fill="none"
          stroke="#0277BD"
          strokeWidth="1.5"
          strokeOpacity="0.6"
        />

        {/* Effet d'eau à l'intérieur */}
        <path
          d="M45 160 L45 275 Q45 295 62 295 L138 295 Q155 295 155 275 L155 160 Q130 165 100 160 Q70 155 45 160 Z"
          fill="url(#waterGradient)"
        />

        {/* Bulles dans l'eau */}
        <circle cx="60" cy="250" r="3" fill="rgba(255,255,255,0.5)" />
        <circle cx="75" cy="270" r="2" fill="rgba(255,255,255,0.4)" />
        <circle cx="130" cy="260" r="2.5" fill="rgba(255,255,255,0.45)" />
        <circle cx="110" cy="280" r="1.5" fill="rgba(255,255,255,0.35)" />

        {/* Reflets principaux - effet plastique brillant */}
        <path
          d="M52 120 L48 140 L48 270 Q48 290 60 292"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M58 125 L55 145 L55 255"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />

        {/* Reflet secondaire côté droit */}
        <path
          d="M150 140 L152 200"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />

        {/* Rainures du plastique (typiques des bouteilles) */}
        <path d="M45 265 Q100 270 155 265" stroke="rgba(0,0,0,0.08)" strokeWidth="1" fill="none" />
        <path d="M45 275 Q100 280 155 275" stroke="rgba(0,0,0,0.08)" strokeWidth="1" fill="none" />
        <path d="M45 285 Q100 290 155 285" stroke="rgba(0,0,0,0.08)" strokeWidth="1" fill="none" />

        {/* Étiquette avec ombre */}
        <rect x="45" y="140" width="110" height="110" rx="4" fill="rgba(0,0,0,0.1)" transform="translate(2, 2)" />
        <rect x="45" y="140" width="110" height="110" rx="4" fill="white" stroke="#E0E0E0" strokeWidth="0.5" />

        {/* Contenu de l'étiquette - ajusté pour ne pas dépasser */}
        <text x="100" y="170" textAnchor="middle" fontSize="24" fill="#1976D2" fontWeight="bold" fontFamily="Arial, sans-serif">BRAVO!</text>
        <line x1="58" y1="180" x2="142" y2="180" stroke="#1976D2" strokeWidth="2" opacity="0.4" />
        <text x="100" y="200" textAnchor="middle" fontSize="13" fill="#424242" fontWeight="500" fontFamily="Arial, sans-serif">{message}</text>

        {/* Noms des indices - taille réduite pour tenir dans l'étiquette */}
        {clueNames.slice(0, 2).map((clue, index) => (
          <text
            key={index}
            x="100"
            y={220 + index * 16}
            textAnchor="middle"
            fontSize="12"
            fill="#1976D2"
            fontWeight="600"
            fontFamily="Arial, sans-serif"
          >
            {truncateClue(clue)}
          </text>
        ))}

        {/* Base de la bouteille (pied) */}
        <ellipse cx="100" cy="302" rx="52" ry="4" fill="rgba(0,0,0,0.1)" />
      </svg>
    </div>
  );
}

function PlasticParticle({ particle }: { particle: Particle }) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: '50%',
        top: '50%',
        width: particle.size,
        height: particle.size,
        background: `linear-gradient(135deg, ${particle.color} 0%, ${particle.color}CC 50%, ${particle.color}88 100%)`,
        clipPath: particle.shape,
        transform: `translate(-50%, -50%)`,
        animation: `explode-particle 2.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${particle.delay}s forwards`,
        '--particle-x': `${particle.x}px`,
        '--particle-y': `${particle.y}px`,
        '--particle-rotation': `${particle.rotation}deg`,
        boxShadow: `inset 2px 2px 4px rgba(255,255,255,0.5), 0 2px 8px ${particle.color}60`,
        border: `1px solid ${particle.color}AA`,
      } as React.CSSProperties}
    />
  );
}

export default function SuccessFeedback({ clueNames }: SuccessFeedbackProps) {
  const isMultiple = clueNames.length > 1;
  const [isShaking, setIsShaking] = useState(false);
  const [isExploding, setIsExploding] = useState(false);
  const [showParticles, setShowParticles] = useState(false);

  const message = isMultiple ? "Indices trouvés !" : "Indice trouvé !";

  // Générer les particules une seule fois avec useMemo (effet confetti explosif)
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: 120 }, (_, i) => {
      // Distribution radiale plus uniforme pour un vrai effet d'explosion
      const angle = (Math.PI * 2 * i) / 120 + (Math.random() - 0.5) * 0.5;
      const velocity = 200 + Math.random() * 500;
      // Les particules vont surtout vers le haut et les côtés (moins vers le bas)
      const yBias = -Math.abs(Math.sin(angle)) * 150 - 100;
      return {
        id: i,
        x: Math.cos(angle) * velocity,
        y: Math.sin(angle) * velocity + yBias,
        color: PLASTIC_COLORS[Math.floor(Math.random() * PLASTIC_COLORS.length)],
        shape: PLASTIC_SHAPES[Math.floor(Math.random() * PLASTIC_SHAPES.length)],
        size: 12 + Math.random() * 35,
        rotation: Math.random() * 1440 - 720, // Encore plus de rotation
        velocityX: Math.cos(angle) * velocity,
        velocityY: Math.sin(angle) * velocity,
        rotationSpeed: Math.random() * 540 - 270,
        delay: Math.random() * 0.08, // Délai plus court pour effet plus instantané
      };
    });
  }, []);

  useEffect(() => {
    // Phase 1: La bouteille apparaît et reste visible 3.5 secondes
    // Phase 2: Elle commence à trembler pendant 0.5 seconde (tremblement intense)
    // Phase 3: Elle explose à 4 secondes

    const shakeTimer = setTimeout(() => {
      setIsShaking(true);
    }, 3500); // Commence à trembler après 3.5 secondes

    const explodeTimer = setTimeout(() => {
      setIsShaking(false);
      setIsExploding(true);
      setShowParticles(true);
    }, 4000); // Explose à exactement 4 secondes

    return () => {
      clearTimeout(shakeTimer);
      clearTimeout(explodeTimer);
    };
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50 p-4 bg-black/20">
      {/* Style pour l'animation des particules */}
      <style>{`
        @keyframes explode-particle {
          0% {
            transform: translate(-50%, -50%) translate(0, 0) rotate(0deg) scale(0);
            opacity: 1;
          }
          5% {
            transform: translate(-50%, -50%) translate(calc(var(--particle-x) * 0.1), calc(var(--particle-y) * 0.1)) rotate(calc(var(--particle-rotation) * 0.05)) scale(1.8);
            opacity: 1;
          }
          15% {
            transform: translate(-50%, -50%) translate(calc(var(--particle-x) * 0.25), calc(var(--particle-y) * 0.25)) rotate(calc(var(--particle-rotation) * 0.15)) scale(1.4);
            opacity: 1;
          }
          40% {
            opacity: 1;
            transform: translate(-50%, -50%) translate(calc(var(--particle-x) * 0.6), calc(var(--particle-y) * 0.6)) rotate(calc(var(--particle-rotation) * 0.5)) scale(1.1);
          }
          70% {
            opacity: 0.8;
          }
          100% {
            transform: translate(-50%, -50%) translate(var(--particle-x), calc(var(--particle-y) + 400px)) rotate(var(--particle-rotation)) scale(0.3);
            opacity: 0;
          }
        }

        @keyframes bottle-shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          10% { transform: translateX(-12px) rotate(-8deg); }
          20% { transform: translateX(12px) rotate(8deg); }
          30% { transform: translateX(-12px) rotate(-8deg); }
          40% { transform: translateX(12px) rotate(8deg); }
          50% { transform: translateX(-10px) rotate(-6deg); }
          60% { transform: translateX(10px) rotate(6deg); }
          70% { transform: translateX(-10px) rotate(-5deg); }
          80% { transform: translateX(10px) rotate(5deg); }
          90% { transform: translateX(-8px) rotate(-4deg); }
        }

        @keyframes bottle-appear {
          0% {
            transform: scale(0) rotate(-10deg);
            opacity: 0;
          }
          40% {
            transform: scale(1.25) rotate(3deg);
            opacity: 1;
          }
          60% {
            transform: scale(0.9) rotate(-2deg);
          }
          80% {
            transform: scale(1.08) rotate(1deg);
          }
          90% {
            transform: scale(0.98) rotate(-0.5deg);
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }

        @keyframes bottle-explode {
          0% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
            filter: brightness(1);
          }
          20% {
            transform: scale(1.2) rotate(2deg);
            opacity: 1;
            filter: brightness(1.3);
          }
          40% {
            transform: scale(1.35) rotate(-3deg);
            opacity: 1;
            filter: brightness(1.5);
          }
          100% {
            transform: scale(0) rotate(20deg);
            opacity: 0;
            filter: brightness(2);
          }
        }
      `}</style>

      {/* Container des particules */}
      {showParticles && (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          {particles.map((particle) => (
            <PlasticParticle key={particle.id} particle={particle} />
          ))}
        </div>
      )}

      {/* Grande bouteille centrée */}
      <div
        className="flex items-center justify-center"
        style={{ animation: 'bottle-appear 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}
      >
        <PlasticBottle
          isExploding={isExploding}
          isShaking={isShaking}
          message={message}
          clueNames={clueNames}
        />
      </div>
    </div>
  );
}
