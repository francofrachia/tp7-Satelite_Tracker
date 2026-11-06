import type { ConstellationCategory, OrbitalElements } from '../../types/satellite';
import { parseTleEpochToIso } from './types';

interface RawSeed {
  noradId: number;
  name: string;
  category: ConstellationCategory;
  line1: string;
  line2: string;
}

const RAW_SEEDS: RawSeed[] = [
  // Estaciones espaciales y ciencia (LEO)
  {
    noradId: 25544,
    name: 'ISS (ZARYA)',
    category: 'stations',
    line1: '1 25544U 98067A   26304.51234567  .00016717  00000-0  10270-3 0  9993',
    line2: '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.49815350481234',
  },
  {
    noradId: 48274,
    name: 'CSS (TIANHE)',
    category: 'stations',
    line1: '1 48274U 21035A   26304.48125000  .00021510  00000-0  24190-3 0  9991',
    line2: '2 48274  41.4742 312.1145 0005120 278.4120  81.6210 15.60124510314218',
  },
  {
    noradId: 20580,
    name: 'HST (HUBBLE)',
    category: 'stations',
    line1: '1 20580U 90037B   26304.41000000  .00001842  00000-0  92145-4 0  9995',
    line2: '2 20580  28.4698 188.2310 0002490 112.4510 247.6820 15.16842105981231',
  },
  // Meteorológicos (LEO y GEO)
  {
    noradId: 33591,
    name: 'NOAA 19',
    category: 'weather',
    line1: '1 33591U 09005A   26304.45000000  .00000112  00000-0  84512-4 0  9992',
    line2: '2 33591  99.1820 294.1250 0013850 165.2410 194.9120 14.12894512908124',
  },
  {
    noradId: 43013,
    name: 'NOAA 20 (JPSS-1)',
    category: 'weather',
    line1: '1 43013U 17073A   26304.46000000  .00000095  00000-0  61230-4 0  9998',
    line2: '2 43013  98.7410 220.4150 0001250  92.1450 267.9850 14.19541205412563',
  },
  {
    noradId: 38771,
    name: 'METOP-B',
    category: 'weather',
    line1: '1 38771U 12049A   26304.47000000  .00000084  00000-0  58120-4 0  9994',
    line2: '2 38771  98.7020  42.1850 0001680  74.5120 285.6210 14.21485120654120',
  },
  {
    noradId: 47959,
    name: 'SAOCOM 1B (CONAE)',
    category: 'weather',
    line1: '1 47959U 20059A   26304.49000000  .00000412  00000-0  31240-4 0  9996',
    line2: '2 47959  97.8860 120.5410 0001420  88.4120 271.7210 14.81924102315421',
  },
  // Navegación GPS (MEO ~20,200 km)
  {
    noradId: 28474,
    name: 'GPS BIIR-13 (PRN 02)',
    category: 'gps-ops',
    line1: '1 28474U 04045A   26304.35000000 -.00000045  00000-0  00000+0 0  9991',
    line2: '2 28474  55.4120 142.3150 0142150 231.1420 127.8120  2.00562415156421',
  },
  {
    noradId: 41019,
    name: 'GPS BIIF-11 (PRN 10)',
    category: 'gps-ops',
    line1: '1 41019U 15062A   26304.38000000  .00000012  00000-0  00000+0 0  9993',
    line2: '2 41019  55.1240 264.8120 0065410  54.2150 306.4120  2.00568124098512',
  },
  {
    noradId: 43873,
    name: 'GPS BIII-1 (VESPUCCI)',
    category: 'gps-ops',
    line1: '1 43873U 18109A   26304.40000000  .00000018  00000-0  00000+0 0  9997',
    line2: '2 43873  55.0810  22.1450 0012410 118.4120 241.6850  2.00561245058412',
  },
  // Geoestacionarios (GEO ~35,786 km)
  {
    noradId: 41866,
    name: 'GOES 16 (GEO-EAST)',
    category: 'geo',
    line1: '1 41866U 16071A   26304.42000000 -.00000150  00000-0  00000+0 0  9992',
    line2: '2 41866   0.0412  85.4120 0001120 142.1250 218.4120  1.00271245034125',
  },
  {
    noradId: 40946,
    name: 'ARSAT-2 (GEO ARGENTINA)',
    category: 'geo',
    line1: '1 40946U 15054A   26304.43000000 -.00000120  00000-0  00000+0 0  9995',
    line2: '2 40946   0.0215  78.9120 0001850 198.4120 161.2140  1.00270124038412',
  },
  // Constelación Starlink (Subconjunto distribuido en distintos planos orbitales LEO ~550 km)
  {
    noradId: 44713,
    name: 'STARLINK-1007',
    category: 'starlink',
    line1: '1 44713U 19074A   26304.50000000  .00002410  00000-0  17840-3 0  9991',
    line2: '2 44713  53.0542  15.2140 0001420  88.4120 271.7010 15.06412450384121',
  },
  {
    noradId: 44714,
    name: 'STARLINK-1008',
    category: 'starlink',
    line1: '1 44714U 19074B   26304.50000000  .00002150  00000-0  16120-3 0  9994',
    line2: '2 44714  53.0538  45.2140 0001380  92.1140 230.1420 15.06418120384122',
  },
  {
    noradId: 44715,
    name: 'STARLINK-1009',
    category: 'starlink',
    line1: '1 44715U 19074C   26304.50000000  .00001980  00000-0  15410-3 0  9998',
    line2: '2 44715  53.0545  75.2140 0001510  85.4120 190.4120 15.06409540384123',
  },
  {
    noradId: 44716,
    name: 'STARLINK-1010',
    category: 'starlink',
    line1: '1 44716U 19074D   26304.50000000  .00002310  00000-0  17120-3 0  9992',
    line2: '2 44716  53.0541 105.2140 0001290  94.2150 150.8120 15.06415120384124',
  },
  {
    noradId: 44717,
    name: 'STARLINK-1011',
    category: 'starlink',
    line1: '1 44717U 19074E   26304.50000000  .00002040  00000-0  15980-3 0  9996',
    line2: '2 44717  53.0539 135.2140 0001440  89.1240 110.2140 15.06411250384125',
  },
  {
    noradId: 44718,
    name: 'STARLINK-1012',
    category: 'starlink',
    line1: '1 44718U 19074F   26304.50000000  .00002280  00000-0  16890-3 0  9990',
    line2: '2 44718  53.0544 165.2140 0001350  91.4120  70.5120 15.06416840384126',
  },
  {
    noradId: 44719,
    name: 'STARLINK-1013',
    category: 'starlink',
    line1: '1 44719U 19074G   26304.50000000  .00002110  00000-0  16240-3 0  9993',
    line2: '2 44719  53.0540 195.2140 0001490  87.8120  30.9120 15.06413420384127',
  },
  {
    noradId: 44720,
    name: 'STARLINK-1014',
    category: 'starlink',
    line1: '1 44720U 19074H   26304.50000000  .00002490  00000-0  18120-3 0  9997',
    line2: '2 44720  53.0546 225.2140 0001310  93.5120 350.1120 15.06419210384128',
  },
  {
    noradId: 44721,
    name: 'STARLINK-1015',
    category: 'starlink',
    line1: '1 44721U 19074J   26304.50000000  .00001950  00000-0  15120-3 0  9991',
    line2: '2 44721  53.0537 255.2140 0001470  86.9120 310.4120 15.06408120384129',
  },
  {
    noradId: 44722,
    name: 'STARLINK-1016',
    category: 'starlink',
    line1: '1 44722U 19074K   26304.50000000  .00002210  00000-0  16540-3 0  9995',
    line2: '2 44722  53.0543 285.2140 0001390  90.2140 270.8120 15.06414250384130',
  },
  {
    noradId: 44723,
    name: 'STARLINK-1017',
    category: 'starlink',
    line1: '1 44723U 19074L   26304.50000000  .00002360  00000-0  17450-3 0  9999',
    line2: '2 44723  53.0541 315.2140 0001410  88.9120 231.2140 15.06417120384131',
  },
  {
    noradId: 44724,
    name: 'STARLINK-1019',
    category: 'starlink',
    line1: '1 44724U 19074M   26304.50000000  .00002080  00000-0  16010-3 0  9992',
    line2: '2 44724  53.0539 345.2140 0001360  91.8120 191.6120 15.06412140384132',
  },
];

export function getSeedCatalog(category?: ConstellationCategory): OrbitalElements[] {
  const now = Date.now();
  const filtered = category ? RAW_SEEDS.filter((s) => s.category === category) : RAW_SEEDS;
  return filtered.map((s) => ({
    noradId: s.noradId,
    name: s.name,
    line1: s.line1,
    line2: s.line2,
    epochIso: parseTleEpochToIso(s.line1),
    source: 'Offline-Seed',
    fetchedAt: now,
    category: s.category,
  }));
}
