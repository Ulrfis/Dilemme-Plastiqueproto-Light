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
      className={`relative transition-all duration-500 ${isExploding ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
      style={{ animation: isShaking && !isExploding ? 'bottle-shake 0.15s ease-in-out infinite' : 'none' }}
    >
      {/* Grande bouteille de plastique stylisée en SVG */}
      <svg width="200" height="320" viewBox="0 0 200 320" className="drop-shadow-2xl">
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

        {/* Étiquette rectangulaire */}
        <rect x="45" y="145" width="110" height="100" rx="6" fill="white" stroke="#E0E0E0" strokeWidth="1" />

        {/* Contenu de l'étiquette */}
        <text x="100" y="175" textAnchor="middle" fontSize="18" fill="#1976D2" fontWeight="bold">BRAVO!</text>
        <line x1="60" y1="185" x2="140" y2="185" stroke="#1976D2" strokeWidth="1" opacity="0.5" />
        <text x="100" y="210" textAnchor="middle" fontSize="14" fill="#424242">{message}</text>

        {/* Noms des indices sur l'étiquette */}
        {clueNames.slice(0, 2).map((clue, index) => (
          <text
            key={index}
            x="100"
            y={225 + index * 14}
            textAnchor="middle"
            fontSize="10"
            fill="#1976D2"
            fontWeight="500"
          >
            {clue.length > 20 ? clue.substring(0, 18) + '...' : clue}
          </text>
        ))}

        {/* Ondulations plastique en bas */}
        <path d="M50 260 Q70 265 100 260 Q130 255 150 260" stroke="#0288D1" strokeWidth="1" fill="none" opacity="0.3" />
        <path d="M50 270 Q70 275 100 270 Q130 265 150 270" stroke="#0288D1" strokeWidth="1" fill="none" opacity="0.3" />
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
        animation: `explode-particle 2s ease-out ${particle.delay}s forwards`,
        '--particle-x': `${particle.x}px`,
        '--particle-y': `${particle.y}px`,
        '--particle-rotation': `${particle.rotation}deg`,
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

  // Générer les particules une seule fois avec useMemo (plus nombreuses et plus grandes)
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: 60 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 60 + Math.random() * 0.5;
      const velocity = 200 + Math.random() * 300;
      return {
        id: i,
        x: Math.cos(angle) * velocity,
        y: Math.sin(angle) * velocity - 50,
        color: PLASTIC_COLORS[Math.floor(Math.random() * PLASTIC_COLORS.length)],
        shape: PLASTIC_SHAPES[Math.floor(Math.random() * PLASTIC_SHAPES.length)],
        size: 12 + Math.random() * 24,
        rotation: Math.random() * 720 - 360,
        velocityX: Math.cos(angle) * velocity,
        velocityY: Math.sin(angle) * velocity,
        rotationSpeed: Math.random() * 360 - 180,
        delay: Math.random() * 0.2,
      };
    });
  }, []);

  useEffect(() => {
    // Phase 1: La bouteille apparaît et reste visible 3 secondes
    // Phase 2: Elle commence à trembler pendant 1 seconde
    // Phase 3: Elle explose

    const shakeTimer = setTimeout(() => {
      setIsShaking(true);
    }, 3000); // Commence à trembler après 3 secondes

    const explodeTimer = setTimeout(() => {
      setIsShaking(false);
      setIsExploding(true);
      setShowParticles(true);
    }, 4000); // Explose après 4 secondes (3s d'affichage + 1s de tremblement)

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
            transform: translate(-50%, -50%) translate(0, 0) rotate(0deg) scale(1);
            opacity: 1;
          }
          60% {
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) translate(var(--particle-x), var(--particle-y)) rotate(var(--particle-rotation)) scale(0.2);
            opacity: 0;
          }
        }

        @keyframes bottle-shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          10% { transform: translateX(-5px) rotate(-3deg); }
          20% { transform: translateX(5px) rotate(3deg); }
          30% { transform: translateX(-5px) rotate(-3deg); }
          40% { transform: translateX(5px) rotate(3deg); }
          50% { transform: translateX(-5px) rotate(-2deg); }
          60% { transform: translateX(5px) rotate(2deg); }
          70% { transform: translateX(-3px) rotate(-1deg); }
          80% { transform: translateX(3px) rotate(1deg); }
          90% { transform: translateX(-2px) rotate(-1deg); }
        }

        @keyframes bottle-appear {
          0% {
            transform: scale(0.5);
            opacity: 0;
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
