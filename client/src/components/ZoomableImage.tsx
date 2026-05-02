import { useState, useEffect } from "react";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
import { Maximize2, MousePointer2, Hand } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ZoomableImageProps {
  src: string;
  alt: string;
  className?: string;
}

function isTouchDevice(): boolean {
  return typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);
}

function ZoomControls({ isTouch }: { isTouch: boolean }) {
  const { resetTransform, instance } = useControls();
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    const checkZoom = () => {
      setIsZoomed(instance.transformState.scale > 1.05);
    };

    const element = instance.wrapperComponent;
    if (element) {
      element.addEventListener('wheel', checkZoom);
      element.addEventListener('touchmove', checkZoom);
      element.addEventListener('mousedown', checkZoom);
    }

    return () => {
      if (element) {
        element.removeEventListener('wheel', checkZoom);
        element.removeEventListener('touchmove', checkZoom);
        element.removeEventListener('mousedown', checkZoom);
      }
    };
  }, [instance]);

  return (
    <>
      {/* Bouton reset zoom - visible seulement si zoomé */}
      {isZoomed && (
        <Button
          onClick={() => { resetTransform(); setIsZoomed(false); }}
          size="icon"
          variant="secondary"
          className="absolute top-4 right-4 z-20 w-12 h-12 rounded-full bg-background/90 backdrop-blur-sm shadow-lg animate-scale-in"
          data-testid="button-reset-zoom"
        >
          <Maximize2 className="w-5 h-5" />
        </Button>
      )}

      {/* Hint discret en bas à droite - disparaît après zoom */}
      {!isZoomed && (
        <div className="absolute bottom-2 right-2 z-10 pointer-events-none">
          <div className="flex items-center gap-1.5 bg-black/45 backdrop-blur-sm rounded-full px-2 py-1 text-[11px] text-white/90">
            {isTouch
              ? <Hand className="w-3 h-3" />
              : <MousePointer2 className="w-3 h-3" />
            }
            <span>{isTouch ? "Pincez · Glissez" : "Molette · Glissez"}</span>
          </div>
        </div>
      )}
    </>
  );
}

export default function ZoomableImage({ src, alt, className = '' }: ZoomableImageProps) {
  const isTouch = isTouchDevice();

  return (
    <div className={`relative w-full h-full ${className}`} data-testid="zoomable-image-container">
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={6}
        centerOnInit
        wheel={isTouch
          ? { disabled: true }
          : { step: 0.12, smoothStep: 0.01 }
        }
        pinch={isTouch
          ? { step: 8 }
          : { disabled: true }
        }
        doubleClick={{ disabled: false, mode: "zoomIn", step: 1.5 }}
        panning={{
          velocityDisabled: isTouch,
          excluded: ['input', 'textarea'],
        }}
        limitToBounds
      >
        {() => (
          <>
            <TransformComponent
              wrapperClass="!w-full !h-full"
              contentClass="!w-full !h-full flex items-center justify-center"
              wrapperStyle={{ cursor: isTouch ? 'grab' : 'default' }}
            >
              <img
                src={src}
                alt={alt}
                className="w-full h-auto object-contain select-none"
                draggable={false}
                data-testid="img-tutorial"
                style={{ maxHeight: '100%' }}
              />
            </TransformComponent>
            <ZoomControls isTouch={isTouch} />
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
