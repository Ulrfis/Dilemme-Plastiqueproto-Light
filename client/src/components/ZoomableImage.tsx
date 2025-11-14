import { useState, useEffect } from "react";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
import { ZoomIn, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ZoomableImageProps {
  src: string;
  alt: string;
  className?: string;
}

function ZoomControls() {
  const { zoomIn, resetTransform, instance } = useControls();
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    const checkZoom = () => {
      if (instance.transformState.scale > 1) {
        setIsZoomed(true);
      } else {
        setIsZoomed(false);
      }
    };

    const element = instance.wrapperComponent;
    if (element) {
      element.addEventListener('wheel', checkZoom);
      element.addEventListener('touchmove', checkZoom);
    }

    return () => {
      if (element) {
        element.removeEventListener('wheel', checkZoom);
        element.removeEventListener('touchmove', checkZoom);
      }
    };
  }, [instance]);

  return (
    <>
      {/* Bouton reset zoom - visible seulement si zoomé */}
      {isZoomed && (
        <Button
          onClick={() => resetTransform()}
          size="icon"
          variant="secondary"
          className="absolute top-4 right-4 z-20 w-12 h-12 rounded-full bg-background/90 backdrop-blur-sm shadow-lg animate-scale-in"
          data-testid="button-reset-zoom"
        >
          <Maximize2 className="w-5 h-5" />
        </Button>
      )}

      {/* Icône animée pour inciter au zoom - disparaît après zoom */}
      {!isZoomed && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 animate-bounce-subtle">
            <div className="bg-primary/90 backdrop-blur-sm rounded-full p-4 shadow-lg">
              <ZoomIn className="w-8 h-8 text-primary-foreground" />
            </div>
            <p className="text-sm font-medium text-white bg-black/70 backdrop-blur-sm px-4 py-2 rounded-full">
              Pincez pour zoomer
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export default function ZoomableImage({ src, alt, className = '' }: ZoomableImageProps) {
  return (
    <div className={`relative w-full h-full ${className}`} data-testid="zoomable-image-container">
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={4}
        wheel={{ step: 0.1 }}
        pinch={{ step: 5 }}
        doubleClick={{ disabled: false, mode: "zoomIn" }}
        panning={{ velocityDisabled: true }}
      >
        {(utils) => (
          <>
            <TransformComponent
              wrapperClass="!w-full !h-full"
              contentClass="!w-full !h-full flex items-center justify-center"
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
            <ZoomControls />
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
