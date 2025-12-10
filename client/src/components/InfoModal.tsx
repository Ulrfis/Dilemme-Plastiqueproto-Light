import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface InfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function InfoModal({ open, onOpenChange }: InfoModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Info</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-2">Pourquoi ce démonstrateur ?</h2>
            <p className="text-muted-foreground">
              Ce prototype <strong>"Dilemme Plastique"</strong> est une <strong>preuve de concept</strong> (MVP) pour tester une nouvelle approche éducative sur la pollution plastique. Il permet de valider le concept avec des apprenants et des enseignants avant un développement plus complet de cette thématique ainsi que d'autres thématiques.
            </p>
            <p className="text-muted-foreground mt-2">
              Ce démonstrateur est conçu pour un usage desktop et smartphone. L'accès se fait via un lien direct, sans login requis.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Ce qui est attendu de vous</h2>
            <ul className="space-y-2 text-muted-foreground list-disc list-inside">
              <li><strong>Converser avec Peter</strong>, votre guide IA, par la voix (micro) ou par écrit (si le micro ne fonctionne pas)</li>
              <li><strong>Découvrir des indices</strong> en scrutant l'image, pour échanger avec Peter sur votre analyse et compréhension de l'image</li>
              <li><strong>Constituer votre propre compréhension de la problématique</strong>, liée aux indices trouvés, en racontant à la fin de l'expérience votre analyse et votre avis</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Les objectifs pédagogiques</h2>
            <ul className="space-y-2 text-muted-foreground list-disc list-inside">
              <li>Sensibiliser les jeunes de 10 à 18 ans à l'impact du plastique sur la santé et l'environnement</li>
              <li>Offrir une <strong>expérience d'apprentissage immersive</strong> guidée par un agent conversationnel IA</li>
              <li>Favoriser une exploration active par la découverte d'indices</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Comment ça fonctionne</h2>
            <ol className="space-y-2 text-muted-foreground list-decimal list-inside">
              <li><strong>Parlez ou écrivez</strong> à Peter, votre mentor IA</li>
              <li>Peter vous répond <strong>de vive voix</strong> et par écrit</li>
              <li>Votre <strong>progression</strong> (indices trouvés, niveau, score) s'affiche dans l'interface</li>
              <li>Exprimez votre compréhension de l'image au travers d'une phrase de synthèse</li>
              <li>Découvrez la compréhension des autres utilisateurs en lisant leurs descriptions</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">À propos du projet</h2>
            <p className="text-muted-foreground">
              <strong>Dilemme Plastique</strong> est développé par <strong>Memoways</strong> dans le cadre du projet <strong>Edugami</strong>.
            </p>
            <p className="text-muted-foreground mt-2">
              Contact: <a href="mailto:ulrich.fischer@memoways.com" className="text-primary hover:underline">ulrich.fischer@memoways.com</a>
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
