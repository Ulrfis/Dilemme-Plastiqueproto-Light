import { CheckCircle2, Sparkles } from "lucide-react";
import successImage from "@assets/generated_images/Success_celebration_effect_b2828c36.png";

interface SuccessFeedbackProps {
  clueName: string;
}

export default function SuccessFeedback({ clueName }: SuccessFeedbackProps) {
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
              Vous avez trouvé: <span className="font-semibold text-primary">{clueName}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
