import { Station } from '../types';

export const DELHI_NCR_STATIONS: Station[] = [
  // Central Delhi
  { id: 'dl-ito', name: 'ITO', city: 'New Delhi', state: 'Delhi', lat: 28.6318, lon: 77.2483, isBoundaryNode: false, zone: 'Central' },
  { id: 'dl-mandir-marg', name: 'Mandir Marg', city: 'New Delhi', state: 'Delhi', lat: 28.6364, lon: 77.2010, isBoundaryNode: false, zone: 'Central' },
  { id: 'dl-lodhi-road', name: 'Lodhi Road', city: 'New Delhi', state: 'Delhi', lat: 28.5883, lon: 77.2215, isBoundaryNode: false, zone: 'Central' },
  { id: 'dl-jns', name: 'Jawaharlal Nehru Stadium', city: 'New Delhi', state: 'Delhi', lat: 28.5802, lon: 77.2338, isBoundaryNode: false, zone: 'Central' },
  { id: 'dl-mdcns', name: 'Major Dhyan Chand Stadium', city: 'New Delhi', state: 'Delhi', lat: 28.6129, lon: 77.2373, isBoundaryNode: false, zone: 'Central' },

  // East Delhi
  { id: 'dl-anand-vihar', name: 'Anand Vihar', city: 'East Delhi', state: 'Delhi', lat: 28.6469, lon: 77.3160, isBoundaryNode: false, zone: 'East' },
  { id: 'dl-vivek-vihar', name: 'Vivek Vihar', city: 'East Delhi', state: 'Delhi', lat: 28.6723, lon: 77.3153, isBoundaryNode: false, zone: 'East' },
  { id: 'dl-patparganj', name: 'Patparganj', city: 'East Delhi', state: 'Delhi', lat: 28.6237, lon: 77.2872, isBoundaryNode: false, zone: 'East' },
  { id: 'dl-sonia-vihar', name: 'Sonia Vihar', city: 'North East Delhi', state: 'Delhi', lat: 28.7105, lon: 77.2494, isBoundaryNode: false, zone: 'East' },

  // North Delhi
  { id: 'dl-rohini', name: 'Rohini Sector 16', city: 'North West Delhi', state: 'Delhi', lat: 28.7325, lon: 77.1199, isBoundaryNode: false, zone: 'North' },
  { id: 'dl-wazirpur', name: 'Wazirpur Industrial Area', city: 'North Delhi', state: 'Delhi', lat: 28.6997, lon: 77.1654, isBoundaryNode: false, zone: 'North' },
  { id: 'dl-jahangirpuri', name: 'Jahangirpuri', city: 'North Delhi', state: 'Delhi', lat: 28.7328, lon: 77.1706, isBoundaryNode: false, zone: 'North' },
  { id: 'dl-ashok-vihar', name: 'Ashok Vihar', city: 'North Delhi', state: 'Delhi', lat: 28.6954, lon: 77.1817, isBoundaryNode: false, zone: 'North' },
  { id: 'dl-dtu', name: 'Delhi Technological Univ (DTU)', city: 'North Delhi', state: 'Delhi', lat: 28.7501, lon: 77.1113, isBoundaryNode: false, zone: 'North' },
  { id: 'dl-alipur', name: 'Alipur', city: 'North Delhi', state: 'Delhi', lat: 28.8153, lon: 77.1530, isBoundaryNode: false, zone: 'North' },
  { id: 'dl-narela', name: 'Narela', city: 'North Delhi', state: 'Delhi', lat: 28.8526, lon: 77.0924, isBoundaryNode: false, zone: 'North' },
  { id: 'dl-bawana', name: 'Bawana Industrial Area', city: 'North West Delhi', state: 'Delhi', lat: 28.7762, lon: 77.0511, isBoundaryNode: false, zone: 'North' },

  // West Delhi
  { id: 'dl-punjabi-bagh', name: 'Punjabi Bagh', city: 'West Delhi', state: 'Delhi', lat: 28.6740, lon: 77.1310, isBoundaryNode: false, zone: 'West' },
  { id: 'dl-shadipur', name: 'Shadipur', city: 'West Delhi', state: 'Delhi', lat: 28.6514, lon: 77.1581, isBoundaryNode: false, zone: 'West' },
  { id: 'dl-pusa', name: 'Pusa (IARI)', city: 'Central West Delhi', state: 'Delhi', lat: 28.6396, lon: 77.1463, isBoundaryNode: false, zone: 'West' },
  { id: 'dl-dwarka-sec8', name: 'Dwarka Sector 8', city: 'South West Delhi', state: 'Delhi', lat: 28.5710, lon: 77.0719, isBoundaryNode: false, zone: 'West' },
  { id: 'dl-mundka', name: 'Mundka Industrial Area', city: 'West Delhi', state: 'Delhi', lat: 28.6847, lon: 77.0299, isBoundaryNode: false, zone: 'West' },
  { id: 'dl-najafgarh', name: 'Najafgarh', city: 'South West Delhi', state: 'Delhi', lat: 28.6090, lon: 76.9855, isBoundaryNode: false, zone: 'West' },

  // South Delhi
  { id: 'dl-rk-puram', name: 'R.K. Puram', city: 'South West Delhi', state: 'Delhi', lat: 28.5632, lon: 77.1869, isBoundaryNode: false, zone: 'South' },
  { id: 'dl-siri-fort', name: 'Siri Fort', city: 'South Delhi', state: 'Delhi', lat: 28.5504, lon: 77.2159, isBoundaryNode: false, zone: 'South' },
  { id: 'dl-aurobindo', name: 'Sri Aurobindo Marg', city: 'South Delhi', state: 'Delhi', lat: 28.5313, lon: 77.1901, isBoundaryNode: false, zone: 'South' },
  { id: 'dl-okhla-ph2', name: 'Okhla Phase-2', city: 'South East Delhi', state: 'Delhi', lat: 28.5308, lon: 77.2717, isBoundaryNode: false, zone: 'South' },
  { id: 'dl-karni-singh', name: 'Dr. Karni Singh Range', city: 'South Delhi', state: 'Delhi', lat: 28.4986, lon: 77.2648, isBoundaryNode: false, zone: 'South' },

  // NCR - Ghaziabad
  { id: 'gz-vasundhara', name: 'Vasundhara', city: 'Ghaziabad', state: 'Uttar Pradesh', lat: 28.6603, lon: 77.3573, isBoundaryNode: false, zone: 'NCR East' },
  { id: 'gz-indirapuram', name: 'Indirapuram', city: 'Ghaziabad', state: 'Uttar Pradesh', lat: 28.6468, lon: 77.3719, isBoundaryNode: false, zone: 'NCR East' },
  { id: 'gz-sanjay-nagar', name: 'Sanjay Nagar', city: 'Ghaziabad', state: 'Uttar Pradesh', lat: 28.6865, lon: 77.4540, isBoundaryNode: false, zone: 'NCR East' },
  { id: 'gz-loni', name: 'Loni Border', city: 'Ghaziabad', state: 'Uttar Pradesh', lat: 28.7511, lon: 77.2891, isBoundaryNode: false, zone: 'NCR East' },

  // NCR - Noida & Greater Noida
  { id: 'noida-sec62', name: 'Noida Sector 62', city: 'Noida', state: 'Uttar Pradesh', lat: 28.6245, lon: 77.3639, isBoundaryNode: false, zone: 'NCR East' },
  { id: 'noida-sec125', name: 'Noida Sector 125', city: 'Noida', state: 'Uttar Pradesh', lat: 28.5447, lon: 77.3331, isBoundaryNode: false, zone: 'NCR East' },
  { id: 'noida-sec1', name: 'Noida Sector 1', city: 'Noida', state: 'Uttar Pradesh', lat: 28.5898, lon: 77.3101, isBoundaryNode: false, zone: 'NCR East' },
  { id: 'gn-kp3', name: 'Knowledge Park III', city: 'Greater Noida', state: 'Uttar Pradesh', lat: 28.4682, lon: 77.4912, isBoundaryNode: false, zone: 'NCR East' },

  // NCR - Gurugram
  { id: 'ggn-vikas-sadan', name: 'Vikas Sadan', city: 'Gurugram', state: 'Haryana', lat: 28.4552, lon: 77.0329, isBoundaryNode: false, zone: 'NCR South' },
  { id: 'ggn-sec51', name: 'Gurugram Sector 51', city: 'Gurugram', state: 'Haryana', lat: 28.4232, lon: 77.0784, isBoundaryNode: false, zone: 'NCR South' },
  { id: 'ggn-gwal-pahari', name: 'Gwal Pahari', city: 'Gurugram', state: 'Haryana', lat: 28.4312, lon: 77.1517, isBoundaryNode: false, zone: 'NCR South' },

  // NCR - Faridabad
  { id: 'fbd-nit', name: 'New Industrial Town (NIT)', city: 'Faridabad', state: 'Haryana', lat: 28.3904, lon: 77.3051, isBoundaryNode: false, zone: 'NCR South' },
  { id: 'fbd-sec11', name: 'Faridabad Sector 11', city: 'Faridabad', state: 'Haryana', lat: 28.3601, lon: 77.3197, isBoundaryNode: false, zone: 'NCR South' },

  // Fire-Source Boundary Nodes (Punjab/Haryana Synthetic GNN Nodes)
  { id: 'fire-amritsar', name: 'Amritsar Fire Boundary Node', city: 'Amritsar Cluster', state: 'Punjab', lat: 31.6340, lon: 74.8723, isBoundaryNode: true, zone: 'Boundary Fire Node' },
  { id: 'fire-sangrur', name: 'Sangrur Fire Boundary Node', city: 'Sangrur Cluster', state: 'Punjab', lat: 30.2458, lon: 75.8421, isBoundaryNode: true, zone: 'Boundary Fire Node' },
  { id: 'fire-bhatinda', name: 'Bathinda Fire Boundary Node', city: 'Bathinda Cluster', state: 'Punjab', lat: 30.2110, lon: 74.9455, isBoundaryNode: true, zone: 'Boundary Fire Node' },
  { id: 'fire-ludhiana', name: 'Ludhiana Fire Boundary Node', city: 'Ludhiana Cluster', state: 'Punjab', lat: 30.9010, lon: 75.8573, isBoundaryNode: true, zone: 'Boundary Fire Node' },
  { id: 'fire-karnal-gateway', name: 'Karnal Influx Gateway Node', city: 'Karnal Corridor', state: 'Haryana', lat: 29.6857, lon: 76.9905, isBoundaryNode: true, zone: 'Boundary Fire Node' },
];

export const DELHI_CENTER_COORDS: [number, number] = [28.6139, 77.2090];
