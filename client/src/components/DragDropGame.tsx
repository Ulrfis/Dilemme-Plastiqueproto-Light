import { useState, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  closestCenter,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, RotateCcw, ArrowRight } from "lucide-react";
import posthog from "posthog-js";

interface DragDropGameProps {
  userName: string;
  onComplete: () => void;
}

const SENTENCE_PARTS = [
  { id: "blank1", text: "", correctAnswer: "L'homme" },
  { id: "text1", text: " pensif représente l'humanité, inquiète pour son avenir. ", correctAnswer: null },
  { id: "blank2", text: "", correctAnswer: "La femme" },
  { id: "text2", text: " représente la Terre-Mère, menacée par ", correctAnswer: null },
  { id: "blank3", text: "", correctAnswer: "les déchets plastiques" },
  { id: "text3", text: ". L'hélice d'", correctAnswer: null },
  { id: "blank4", text: "", correctAnswer: "ADN" },
  { id: "text4", text: " évoque les dangers pour notre santé : le plastique envahit notre environnement et notre corps.", correctAnswer: null },
];

const DRAGGABLE_WORDS = [
  { id: "word1", text: "les déchets plastiques" },
  { id: "word2", text: "ADN" },
  { id: "word3", text: "le traité plastique" },
  { id: "word4", text: "les algues" },
  { id: "word5", text: "L'homme" },
  { id: "word6", text: "La femme" },
];

interface DraggableWordProps {
  id: string;
  text: string;
  isPlaced: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

function DraggableWord({ id, text, isPlaced, isSelected, onSelect }: DraggableWordProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled: isPlaced,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : isPlaced ? 0.4 : 1,
    touchAction: "none",
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isPlaced) {
      onSelect();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      className={`
        px-4 py-3 rounded-full font-medium text-sm sm:text-base
        transition-all duration-200 select-none
        ${isPlaced 
          ? 'bg-muted text-muted-foreground cursor-not-allowed line-through' 
          : isSelected
            ? 'bg-primary text-primary-foreground ring-4 ring-primary/50 ring-offset-2 scale-105 shadow-lg cursor-pointer'
            : 'bg-primary text-primary-foreground cursor-grab active:cursor-grabbing shadow-md hover:shadow-lg hover:scale-102 active:scale-95'
        }
        ${isDragging ? 'ring-2 ring-primary ring-offset-2' : ''}
      `}
      data-testid={`draggable-${id}`}
    >
      {text}
    </div>
  );
}

interface DroppableSlotProps {
  id: string;
  placedWord: string | null;
  onRemove: () => void;
  onPlace: () => void;
  hasSelectedWord: boolean;
}

function DroppableSlot({ id, placedWord, onRemove, onPlace, hasSelectedWord }: DroppableSlotProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  const handleClick = () => {
    if (placedWord) {
      onRemove();
    } else if (hasSelectedWord) {
      onPlace();
    }
  };

  return (
    <span
      ref={setNodeRef}
      onClick={handleClick}
      className={`
        inline-flex items-center justify-center
        min-w-[120px] sm:min-w-[160px] min-h-[40px] px-3 py-2 mx-1
        rounded-lg border-2 border-dashed transition-all duration-200
        ${isOver 
          ? 'border-primary bg-primary/10 scale-105' 
          : placedWord 
            ? 'border-primary/50 bg-primary/5 cursor-pointer hover:bg-red-50 hover:border-red-300' 
            : hasSelectedWord
              ? 'border-primary bg-primary/10 cursor-pointer hover:bg-primary/20 animate-pulse'
              : 'border-muted-foreground/30 bg-muted/30'
        }
      `}
      data-testid={`droppable-${id}`}
    >
      {placedWord ? (
        <span className="font-medium text-primary text-sm sm:text-base">{placedWord}</span>
      ) : (
        <span className="text-muted-foreground text-xs sm:text-sm">
          {hasSelectedWord ? 'Cliquez ici' : '___________'}
        </span>
      )}
    </span>
  );
}

export default function DragDropGame({ userName, onComplete }: DragDropGameProps) {
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [validationResult, setValidationResult] = useState<{ errors: number; validated: boolean } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    })
  );

  const placedWordTexts = Object.values(placements);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setSelectedWordId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (!over) return;

    const wordId = active.id as string;
    const slotId = over.id as string;

    if (!slotId.startsWith("blank")) return;

    const word = DRAGGABLE_WORDS.find(w => w.id === wordId);
    if (!word) return;

    placeWordInSlot(word.text, slotId);
  };

  const placeWordInSlot = (wordText: string, slotId: string) => {
    setPlacements(prev => ({
      ...prev,
      [slotId]: wordText,
    }));
    setValidationResult(null);
  };

  const handleWordSelect = (wordId: string) => {
    if (selectedWordId === wordId) {
      setSelectedWordId(null);
    } else {
      setSelectedWordId(wordId);
    }
  };

  const handleSlotPlace = (slotId: string) => {
    if (!selectedWordId) return;
    
    const word = DRAGGABLE_WORDS.find(w => w.id === selectedWordId);
    if (!word) return;

    placeWordInSlot(word.text, slotId);
    setSelectedWordId(null);
  };

  const handleRemoveWord = useCallback((slotId: string) => {
    setPlacements(prev => {
      const newPlacements = { ...prev };
      delete newPlacements[slotId];
      return newPlacements;
    });
    setValidationResult(null);
  }, []);

  const handleValidate = () => {
    const blanks = SENTENCE_PARTS.filter(p => p.correctAnswer !== null);
    let errors = 0;

    blanks.forEach(blank => {
      const placed = placements[blank.id];
      if (!placed || placed.toLowerCase() !== blank.correctAnswer?.toLowerCase()) {
        errors++;
      }
    });

    setValidationResult({ errors, validated: true });
  };

  const handleReset = () => {
    setPlacements({});
    setValidationResult(null);
    setSelectedWordId(null);
  };

  const allSlotsFilled = SENTENCE_PARTS.filter(p => p.correctAnswer !== null).every(
    blank => placements[blank.id]
  );

  const isSuccess = validationResult?.validated && validationResult.errors === 0;

  const activeWord = activeId ? DRAGGABLE_WORDS.find(w => w.id === activeId) : null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary/5 via-background to-chart-2/5 px-4 py-6">
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
        <div className="text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold font-heading mb-2">
            Complète la phrase, {userName} !
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base">
            Clique sur un mot puis sur un espace vide, ou glisse les mots.
          </p>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="bg-card border border-card-border rounded-2xl p-4 sm:p-6 mb-6 shadow-lg">
            <p className="text-base sm:text-lg leading-relaxed text-foreground">
              {SENTENCE_PARTS.map((part) => {
                if (part.correctAnswer === null) {
                  return <span key={part.id}>{part.text}</span>;
                }
                return (
                  <DroppableSlot
                    key={part.id}
                    id={part.id}
                    placedWord={placements[part.id] || null}
                    onRemove={() => handleRemoveWord(part.id)}
                    onPlace={() => handleSlotPlace(part.id)}
                    hasSelectedWord={!!selectedWordId && !placements[part.id]}
                  />
                );
              })}
            </p>
          </div>

          <div className="bg-card border border-card-border rounded-2xl p-4 sm:p-6 mb-6">
            <p className="text-sm text-muted-foreground mb-4 text-center">
              Mots disponibles :
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              {DRAGGABLE_WORDS.map((word) => {
                const isPlaced = placedWordTexts.includes(word.text);
                return (
                  <DraggableWord
                    key={word.id}
                    id={word.id}
                    text={word.text}
                    isPlaced={isPlaced}
                    isSelected={selectedWordId === word.id}
                    onSelect={() => handleWordSelect(word.id)}
                  />
                );
              })}
            </div>
          </div>

          <DragOverlay>
            {activeWord ? (
              <div className="px-4 py-3 rounded-full font-medium text-sm sm:text-base bg-primary text-primary-foreground shadow-xl ring-2 ring-primary ring-offset-2">
                {activeWord.text}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {validationResult && (
          <div 
            className={`
              rounded-2xl p-4 mb-6 text-center transition-all duration-300
              ${isSuccess 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-orange-50 border border-orange-200'
              }
            `}
            data-testid="validation-result"
          >
            {isSuccess ? (
              <div className="flex items-center justify-center gap-2 text-green-700">
                <CheckCircle2 className="w-6 h-6" />
                <span className="font-semibold text-lg">Parfait ! Aucune erreur !</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-orange-700">
                <XCircle className="w-6 h-6" />
                <span className="font-semibold text-lg">
                  {validationResult.errors} erreur{validationResult.errors > 1 ? 's' : ''} détectée{validationResult.errors > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 mt-auto">
          {!isSuccess ? (
            <>
              <Button
                onClick={handleValidate}
                disabled={!allSlotsFilled}
                size="lg"
                className="w-full rounded-xl text-lg py-6"
                data-testid="button-validate"
              >
                Valider ma réponse
              </Button>

              {validationResult && !isSuccess && (
                <Button
                  onClick={handleReset}
                  variant="outline"
                  size="lg"
                  className="w-full rounded-xl"
                  data-testid="button-reset"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Recommencer
                </Button>
              )}
            </>
          ) : (
            <Button
              onClick={() => {
                posthog.capture("game_completed", { userName });
                onComplete();
              }}
              size="lg"
              className="w-full rounded-xl text-lg py-6"
              data-testid="button-continue"
            >
              Continuer
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
