import { Sparkles } from "lucide-react";
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

function PlasticBottle({ isExploding }: { isExploding: boolean }) {
  return (
    <div className={`relative transition-all duration-300 ${isExploding ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}>
      {/* Bouteille de plastique stylisée en SVG */}
      <svg width="80" height="120" viewBox="0 0 80 120" className="drop-shadow-lg">
        {/* Bouchon */}
        <rect x="30" y="0" width="20" height="12" rx="2" fill="#1E88E5" />
        {/* Goulot */}
        <path d="M32 12 L32 20 L28 25 L28 30 L52 30 L52 25 L48 20 L48 12" fill="#64B5F6" />
        {/* Corps de la bouteille */}
        <path
          d="M28 30 L20 45 L15 55 L15 105 Q15 115 25 115 L55 115 Q65 115 65 105 L65 55 L60 45 L52 30 Z"
          fill="#42A5F5"
          stroke="#1976D2"
          strokeWidth="1"
        />
        {/* Reflets */}
        <path d="M25 50 L25 100 Q25 108 30 108" stroke="rgba(255,255,255,0.5)" strokeWidth="3" fill="none" />
        {/* Étiquette */}
        <rect x="20" y="60" width="40" height="30" rx="2" fill="white" opacity="0.9" />
        <text x="40" y="78" textAnchor="middle" fontSize="8" fill="#1976D2" fontWeight="bold">PLASTIQUE</text>
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
  const [isExploding, setIsExploding] = useState(false);
  const [showParticles, setShowParticles] = useState(false);

  // Générer les particules une seule fois avec useMemo
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: 40 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 40 + Math.random() * 0.5;
      const velocity = 150 + Math.random() * 200;
      return {
        id: i,
        x: Math.cos(angle) * velocity,
        y: Math.sin(angle) * velocity - 100, // Bias upward
        color: PLASTIC_COLORS[Math.floor(Math.random() * PLASTIC_COLORS.length)],
        shape: PLASTIC_SHAPES[Math.floor(Math.random() * PLASTIC_SHAPES.length)],
        size: 8 + Math.random() * 16,
        rotation: Math.random() * 720 - 360,
        velocityX: Math.cos(angle) * velocity,
        velocityY: Math.sin(angle) * velocity,
        rotationSpeed: Math.random() * 360 - 180,
        delay: Math.random() * 0.15,
      };
    });
  }, []);

  useEffect(() => {
    // Délai avant l'explosion
    const explodeTimer = setTimeout(() => {
      setIsExploding(true);
      setShowParticles(true);
    }, 400);

    return () => clearTimeout(explodeTimer);
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50 p-4">
      {/* Style pour l'animation des particules */}
      <style>{`
        @keyframes explode-particle {
          0% {
            transform: translate(-50%, -50%) translate(0, 0) rotate(0deg) scale(1);
            opacity: 1;
          }
          70% {
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) translate(var(--particle-x), var(--particle-y)) rotate(var(--particle-rotation)) scale(0.3);
            opacity: 0;
          }
        }

        @keyframes bottle-shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          20% { transform: translateX(-3px) rotate(-2deg); }
          40% { transform: translateX(3px) rotate(2deg); }
          60% { transform: translateX(-2px) rotate(-1deg); }
          80% { transform: translateX(2px) rotate(1deg); }
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

      <div className="bg-card border-2 border-primary rounded-2xl shadow-2xl p-6 sm:p-8 animate-scale-in max-w-xs sm:max-w-sm w-full relative">
        <div className="flex flex-col items-center space-y-3 sm:space-y-4">
          {/* Bouteille qui explose */}
          <div
            className="relative h-32 flex items-center justify-center"
            style={{ animation: !isExploding ? 'bottle-shake 0.3s ease-in-out infinite' : 'none' }}
          >
            <PlasticBottle isExploding={isExploding} />
          </div>

          <div className="text-center space-y-1.5 sm:space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary animate-pulse" />
              <h3 className="text-xl sm:text-2xl font-bold">Bravo!</h3>
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary animate-pulse" />
            </div>
            <p className="text-base sm:text-lg font-medium">
              {isMultiple ? "Indices trouvés !" : "Indice trouvé !"}
            </p>
            <div className="flex flex-col gap-1 mt-2">
              {clueNames.map((clue, index) => (
                <p key={index} className="font-semibold text-primary text-sm sm:text-base">
                  {clue}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
