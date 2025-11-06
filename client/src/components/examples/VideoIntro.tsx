import VideoIntro from '../VideoIntro';

export default function VideoIntroExample() {
  return (
    <VideoIntro 
      onComplete={() => console.log('Video completed')} 
    />
  );
}
