import { useEffect, useState, useMemo } from "react";

interface SuccessFeedbackProps {
  clueNames: string[];
}

// Couleurs des morceaux de plastique (couleurs vives de bouteilles)
const PLASTIC_COLORS = [
  '#00A8E8', // Bleu clair (eau)
  '#FF6B6B', // Rouge/rose
  '#4ECDC4', // Turquoise
  '#FFE66D', // Jaune
  '#95E1A3', // Vert clair
  '#FF8C42', // Orange
  '#A8E6CF', // Vert menthe
  '#DDA0DD', // Mauve
  '#87CEEB', // Bleu ciel
  '#F0E68C', // Kaki clair
];

// Formes des morceaux de plastique
const PLASTIC_SHAPES = [
  'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', // Losange
  'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)', // Hexagone
  'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)', // Étoile
  'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)', // Carré
  'polygon(50% 0%, 100% 100%, 0% 100%)', // Triangle
  'ellipse(50% 30% at 50% 50%)', // Ovale
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
  return (
    <div
      className={`relative transition-all duration-300 ${isExploding ? 'scale-150 opacity-0' : 'scale-100 opacity-100'}`}
      style={{ animation: isShaking && !isExploding ? 'bottle-shake 0.1s ease-in-out infinite' : 'none' }}
    >
      {/* Grande bouteille de plastique stylisée en SVG */}
      <svg width="280" height="450" viewBox="0 0 200 320" className="drop-shadow-2xl">
        {/* Dégradé pour le plastique */}
        <defs>
          <linearGradient id="bottleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#29B6F6" />
            <stop offset="30%" stopColor="#4FC3F7" />
            <stop offset="70%" stopColor="#4FC3F7" />
            <stop offset="100%" stopColor="#29B6F6" />
          </linearGradient>
          <linearGradient id="capGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1565C0" />
            <stop offset="50%" stopColor="#1976D2" />
            <stop offset="100%" stopColor="#1565C0" />
          </linearGradient>
        </defs>

        {/* Bouchon (sans fond blanc) */}
        <rect x="75" y="0" width="50" height="25" rx="4" fill="url(#capGradient)" />
        <rect x="80" y="5" width="40" height="5" rx="2" fill="#0D47A1" opacity="0.3" />

        {/* Goulot */}
        <path d="M80 25 L80 45 L70 60 L70 75 L130 75 L130 60 L120 45 L120 25" fill="url(#bottleGradient)" />

        {/* Corps de la bouteille */}
        <path
          d="M70 75 L50 110 L35 140 L35 285 Q35 305 55 305 L145 305 Q165 305 165 285 L165 140 L150 110 L130 75 Z"
          fill="url(#bottleGradient)"
          stroke="#0288D1"
          strokeWidth="2"
        />

        {/* Reflets sur la bouteille */}
        <path d="M55 120 L55 270 Q55 290 70 290" stroke="rgba(255,255,255,0.6)" strokeWidth="8" fill="none" strokeLinecap="round" />
        <path d="M65 130 L65 250" stroke="rgba(255,255,255,0.3)" strokeWidth="4" fill="none" strokeLinecap="round" />

        {/* Étiquette rectangulaire - plus grande */}
        <rect x="40" y="135" width="120" height="120" rx="6" fill="white" stroke="#E0E0E0" strokeWidth="1" />

        {/* Contenu de l'étiquette - textes plus grands */}
        <text x="100" y="170" textAnchor="middle" fontSize="26" fill="#1976D2" fontWeight="bold">BRAVO!</text>
        <line x1="55" y1="182" x2="145" y2="182" stroke="#1976D2" strokeWidth="2" opacity="0.5" />
        <text x="100" y="210" textAnchor="middle" fontSize="18" fill="#424242" fontWeight="500">{message}</text>

        {/* Noms des indices sur l'étiquette - plus grands */}
        {clueNames.slice(0, 2).map((clue, index) => (
          <text
            key={index}
            x="100"
            y={232 + index * 18}
            textAnchor="middle"
            fontSize="14"
            fill="#1976D2"
            fontWeight="600"
          >
            {clue.length > 18 ? clue.substring(0, 16) + '...' : clue}
          </text>
        ))}

        {/* Ondulations plastique en bas */}
        <path d="M50 270 Q70 275 100 270 Q130 265 150 270" stroke="#0288D1" strokeWidth="1" fill="none" opacity="0.3" />
        <path d="M50 280 Q70 285 100 280 Q130 275 150 280" stroke="#0288D1" strokeWidth="1" fill="none" opacity="0.3" />
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
        backgroundColor: particle.color,
        clipPath: particle.shape,
        transform: `translate(-50%, -50%)`,
        animation: `explode-particle 2.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${particle.delay}s forwards`,
        '--particle-x': `${particle.x}px`,
        '--particle-y': `${particle.y}px`,
        '--particle-rotation': `${particle.rotation}deg`,
        boxShadow: `0 0 ${particle.size / 3}px ${particle.color}40`,
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

  // Générer les particules une seule fois avec useMemo (effet confetti massif)
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: 100 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 100 + Math.random() * 0.8;
      const velocity = 250 + Math.random() * 400;
      return {
        id: i,
        x: Math.cos(angle) * velocity,
        y: Math.sin(angle) * velocity - 100 - Math.random() * 150, // Monte plus haut
        color: PLASTIC_COLORS[Math.floor(Math.random() * PLASTIC_COLORS.length)],
        shape: PLASTIC_SHAPES[Math.floor(Math.random() * PLASTIC_SHAPES.length)],
        size: 15 + Math.random() * 30,
        rotation: Math.random() * 1080 - 540, // Plus de rotation
        velocityX: Math.cos(angle) * velocity,
        velocityY: Math.sin(angle) * velocity,
        rotationSpeed: Math.random() * 360 - 180,
        delay: Math.random() * 0.15,
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
            transform: translate(-50%, -50%) translate(0, 0) rotate(0deg) scale(1.5);
            opacity: 1;
          }
          20% {
            opacity: 1;
            transform: translate(-50%, -50%) translate(calc(var(--particle-x) * 0.3), calc(var(--particle-y) * 0.3)) rotate(calc(var(--particle-rotation) * 0.3)) scale(1.2);
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) translate(var(--particle-x), calc(var(--particle-y) + 200px)) rotate(var(--particle-rotation)) scale(0.3);
            opacity: 0;
          }
        }

        @keyframes bottle-shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          10% { transform: translateX(-8px) rotate(-5deg); }
          20% { transform: translateX(8px) rotate(5deg); }
          30% { transform: translateX(-8px) rotate(-5deg); }
          40% { transform: translateX(8px) rotate(5deg); }
          50% { transform: translateX(-6px) rotate(-4deg); }
          60% { transform: translateX(6px) rotate(4deg); }
          70% { transform: translateX(-6px) rotate(-3deg); }
          80% { transform: translateX(6px) rotate(3deg); }
          90% { transform: translateX(-4px) rotate(-2deg); }
        }

        @keyframes bottle-appear {
          0% {
            transform: scale(0.3);
            opacity: 0;
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
            opacity: 1;
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
        style={{ animation: 'bottle-appear 0.5s ease-out forwards' }}
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
