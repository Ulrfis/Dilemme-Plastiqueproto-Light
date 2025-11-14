import { CheckCircle2, Sparkles } from "lucide-react";
import successImage from "@assets/generated_images/Success_celebration_effect_b2828c36.png";

interface SuccessFeedbackProps {
  clueNames: string[];
}

export default function SuccessFeedback({ clueNames }: SuccessFeedbackProps) {
  const isMultiple = clueNames.length > 1;

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
      <div className="bg-card border-2 border-primary rounded-2xl shadow-2xl p-8 animate-scale-in max-w-sm mx-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            <img
              src={successImage}
              alt="Success"
              className="w-24 h-24 object-contain"
            />
            <CheckCircle2 className="w-12 h-12 text-primary absolute -bottom-2 -right-2 bg-background rounded-full" />
          </div>

          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h3 className="text-2xl font-bold">Bravo!</h3>
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <p className="text-lg">
              {isMultiple ? "Vous avez trouvé:" : "Vous avez trouvé:"}
            </p>
            <div className="flex flex-col gap-1">
              {clueNames.map((clue, index) => (
                <p key={index} className="font-semibold text-primary">
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
