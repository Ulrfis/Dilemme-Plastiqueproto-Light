import WelcomeSetup from '../WelcomeSetup';

export default function WelcomeSetupExample() {
  return (
    <WelcomeSetup 
      onStart={(name) => console.log('Started with name:', name)} 
    />
  );
}
