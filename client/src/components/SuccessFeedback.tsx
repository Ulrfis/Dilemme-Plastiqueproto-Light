import { CheckCircle2, Sparkles } from "lucide-react";
import successImage from "@assets/generated_images/Success_celebration_effect_b2828c36.png";

interface SuccessFeedbackProps {
  clueNames: string[];
}

export default function SuccessFeedback({ clueNames }: SuccessFeedbackProps) {
  const isMultiple = clueNames.length > 1;

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50 p-4">
      <div className="bg-card border-2 border-primary rounded-2xl shadow-2xl p-6 sm:p-8 animate-scale-in max-w-xs sm:max-w-sm w-full">
        <div className="flex flex-col items-center space-y-3 sm:space-y-4">
          <div className="relative">
            <img
              src={successImage}
              alt="Success"
              className="w-20 h-20 sm:w-24 sm:h-24 object-contain"
            />
            <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-primary absolute -bottom-2 -right-2 bg-background rounded-full" />
          </div>

          <div className="text-center space-y-1.5 sm:space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              <h3 className="text-xl sm:text-2xl font-bold">Bravo!</h3>
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <p className="text-base sm:text-lg">
              {isMultiple ? "Vous avez trouvé:" : "Vous avez trouvé:"}
            </p>
            <div className="flex flex-col gap-1">
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
