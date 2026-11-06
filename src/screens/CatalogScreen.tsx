import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import type {
  ConstellationCategory,
  OrbitalElements,
} from '../types/satellite';
import { dataOrchestrator } from '../services/dataOrchestrator';

interface CatalogScreenProps {
  catalog: OrbitalElements[];
  selectedSat: OrbitalElements;
  activeCategory: ConstellationCategory;
  providerUsed: string;
  cacheAgeHours: number;
  loading: boolean;
  onChangeCategory: (cat: ConstellationCategory) => void;
  onRefreshCatalog: () => void;
  onSelectSatellite: (sat: OrbitalElements) => void;
}

const CATEGORIES: { id: ConstellationCategory; label: string }[] = [
  { id: 'stations', label: 'Estaciones (ISS)' },
  { id: 'starlink', label: 'Starlink (SupGP)' },
  { id: 'gps-ops', label: 'GPS (MEO)' },
  { id: 'weather', label: 'Clima / CONAE' },
  { id: 'geo', label: 'GEO (ARSAT/GOES)' },
];

export const CatalogScreen: React.FC<CatalogScreenProps> = ({
  catalog,
  selectedSat,
  activeCategory,
  providerUsed,
  cacheAgeHours,
  loading,
  onChangeCategory,
  onRefreshCatalog,
  onSelectSatellite,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingRemoteNorad, setSearchingRemoteNorad] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        String(item.noradId).includes(q)
    );
  }, [catalog, searchQuery]);

  // Permite buscar directamente cualquier NORAD ID en las APIs si no está en la categoría actual
  const handleLookupByNoradId = async () => {
    const norad = parseInt(searchQuery.trim(), 10);
    if (Number.isNaN(norad) || norad <= 0) {
      setRemoteError('Ingresa un NORAD ID numérico válido (ej. 25544, 47959, 44713).');
      return;
    }

    setSearchingRemoteNorad(true);
    setRemoteError(null);
    try {
      const found = await dataOrchestrator.getSatelliteByNoradId(norad);
      if (found) {
        onSelectSatellite(found);
      } else {
        setRemoteError(`No se encontró el satélite NORAD #${norad} en CelesTrak / Space-Track / N2YO.`);
      }
    } catch (err) {
      setRemoteError(err instanceof Error ? err.message : 'Error al consultar NORAD ID');
    } finally {
      setSearchingRemoteNorad(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Buscador por nombre o NORAD ID (RF-01) */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar satélite por nombre o NORAD ID (ej. ISS, 25544, STARLINK)..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={(txt) => {
            setSearchQuery(txt);
            setRemoteError(null);
          }}
        />
        {/^\d+$/.test(searchQuery.trim()) && (
          <TouchableOpacity
            style={styles.noradLookupBtn}
            onPress={handleLookupByNoradId}
            disabled={searchingRemoteNorad}
          >
            <Text style={styles.noradLookupBtnText}>
              {searchingRemoteNorad ? '...' : 'Consultar ID'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {remoteError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{remoteError}</Text>
        </View>
      )}

      {/* Filtros por constelación (RF-08) */}
      <View style={styles.categoriesRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORIES}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
          renderItem={({ item }) => {
            const active = item.id === activeCategory;
            return (
              <TouchableOpacity
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => onChangeCategory(item.id)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    active && styles.categoryChipTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Barra de estado de caché y proveedor (RF-09, RF-14, RF-16) */}
      <View style={styles.cacheStatusRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cacheText}>
            Proveedor: <Text style={styles.cacheHighlight}>{providerUsed}</Text> •{' '}
            {filteredCatalog.length} objetos
          </Text>
          <Text style={styles.cacheSubText}>
            Antigüedad caché: {cacheAgeHours.toFixed(1)} h (TTL auto-refresco: 12 h)
          </Text>
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={onRefreshCatalog}
          disabled={loading}
        >
          <Text style={styles.refreshBtnText}>
            {loading ? 'Cargando...' : '↻ Actualizar API'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loaderBox}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loaderText}>
            Descargando elementos orbitales (OMM/TLE)...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredCatalog}
          keyExtractor={(item) => `${item.noradId}_${item.name}`}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelected = item.noradId === selectedSat.noradId;
            const epochAgeHours = dataOrchestrator.getDataAgeHours(item);
            const formatType = item.omm ? 'OMM/JSON' : 'TLE';
            return (
              <TouchableOpacity
                style={[styles.satCard, isSelected && styles.satCardSelected]}
                onPress={() => onSelectSatellite(item)}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.satName}>{item.name}</Text>
                    <View style={styles.badgeRow}>
                      <Text style={styles.formatBadge}>{formatType}</Text>
                      <Text style={styles.noradTag}>NORAD #{item.noradId}</Text>
                    </View>
                  </View>
                  <Text style={styles.satMeta}>
                    Fuente: {item.source} • Época hace {epochAgeHours.toFixed(1)} h
                  </Text>
                </View>
                <View style={styles.selectIndicator}>
                  <Text style={styles.selectIndicatorText}>
                    {isSelected ? '✓ Activo' : 'Seguir →'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                No se encontraron satélites en esta constelación con &quot;{searchQuery}&quot;.
              </Text>
              {/^\d+$/.test(searchQuery.trim()) && (
                <TouchableOpacity
                  style={[styles.noradLookupBtn, { marginTop: 12 }]}
                  onPress={handleLookupByNoradId}
                >
                  <Text style={styles.noradLookupBtnText}>
                    Buscar NORAD #{searchQuery.trim()} en APIs externas
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  searchSection: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    fontSize: 13,
  },
  noradLookupBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noradLookupBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  errorBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  errorBannerText: {
    color: '#FCA5A5',
    fontSize: 12,
  },
  categoriesRow: {
    paddingVertical: 6,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  categoryChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  categoryChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  cacheStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1E293B',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#334155',
    marginTop: 4,
  },
  cacheText: {
    color: '#CBD5E1',
    fontSize: 11,
  },
  cacheHighlight: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  cacheSubText: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
  },
  refreshBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  refreshBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
  },
  loaderBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loaderText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 13,
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  satCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 8,
  },
  satCardSelected: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(14, 165, 233, 0.14)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingRight: 8,
  },
  satName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formatBadge: {
    color: '#C084FC',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: 'rgba(192, 132, 252, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  noradTag: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
  },
  satMeta: {
    color: '#94A3B8',
    fontSize: 11,
  },
  selectIndicator: {
    paddingLeft: 8,
  },
  selectIndicatorText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyBox: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94A3B8',
    textAlign: 'center',
    fontSize: 13,
  },
});
