// Cameras shown in the "Traffic cameras" grid.
//
// Each camera with a videoId plays inside the dashboard: a live thumbnail on the card,
// a muted preview on hover, and a full player when clicked.
//
// To add a camera, add an entry with its YouTube video ID:
//   1. Open the camera's live stream on YouTube.
//   2. The ID is the 11 characters after "v=" in the address bar
//      (youtube.com/watch?v=THIS_PART).
//
// Live stream IDs can change when an owner restarts a stream. If a card stops
// working, look up the camera's current ID and replace it here.
//
// Only embed streams whose owners allow embedding.
//
// Fields: id, name (title), city (location label), source (who runs it),
//         videoId, sourceUrl (optional link to the owner's page)
const JAZBAZ = 'https://www.youtube.com/@jazbazphilippines';

export const LIVE_CAMS = [
  { id: 'davao-bangoy', name: 'Bangoy Street', city: 'Agdao, Davao City', source: 'JazBaz Philippines', videoId: 'eYAB0HX8NF8', sourceUrl: JAZBAZ },
  { id: 'davao-leon-garcia', name: 'Leon Garcia Street (Agdao Flyover)', city: 'Agdao, Davao City', source: 'JazBaz Philippines', videoId: 'FWvIPfxK5Jo', sourceUrl: JAZBAZ },
  { id: 'davao-soliman', name: 'Soliman Street (Sta. Cruz Chapel)', city: 'Agdao, Davao City', source: 'JazBaz Philippines', videoId: 'DSRm7V_bsm8', sourceUrl: JAZBAZ },
  { id: 'davao-soliman-flyover', name: 'Soliman Street (toward Agdao Flyover)', city: 'Agdao, Davao City', source: 'JazBaz Philippines', videoId: 'Far_aDIwAyw', sourceUrl: JAZBAZ },
  { id: 'davao-roxas', name: 'Roxas Avenue and Quezon Boulevard', city: 'Poblacion, Davao City', source: 'JazBaz Philippines', videoId: 'MncLrf2LsT8', sourceUrl: JAZBAZ }
];

// Where to look for more cameras (shown only if LIVE_CAMS is empty).
export const CAM_DIRECTORIES = [
  { name: 'WorldCam Philippines', url: 'https://worldcam.eu/webcams/asia/philippines' },
  { name: 'EarthCam world map', url: 'https://www.earthcam.com/mapsearch/' }
];

// Road cameras and camera directories that are not embedded here yet.
// They open in a new tab.
export const MORE_ROAD_CAMS = [
  { name: 'Olongapo traffic', city: 'Olongapo, Zambales (WorldCam)', url: 'https://worldcam.eu/webcams/asia/philippines/7387-olongapo-traffic' },
  { name: 'FPIP II, Maharlika Highway', city: 'Santo Tomas, Batangas (WorldCam)', url: 'https://worldcam.eu/webcams/asia/philippines/35847-santo-tomas-fpip-ii-maharlika-highway' },
  { name: 'Bonto Boulevard', city: 'Tabaco, Albay (WorldCam)', url: 'https://worldcam.eu/webcams/asia/philippines/34478-tabaco-bonto-boulevard' },
  { name: 'Street Cam Cebu', city: 'Cebu City, Mandaue, Lapu-Lapu (Facebook live)', url: 'https://www.facebook.com/StreetCamCebu/' },
  { name: 'Philippine traffic cameras', city: 'San Fernando, Tondo and more (OpenCCTV)', url: 'https://opencctv.org/livetraffic/philippines' }
];
