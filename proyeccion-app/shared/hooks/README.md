# Hooks Reutilizables

Esta carpeta contiene hooks personalizados reutilizables en toda la aplicación.

## Hooks Disponibles

### 1. `usePagination` - Paginación de Firestore

Hook genérico para manejar paginación de colecciones de Firestore.

**Uso:**
```typescript
import { usePagination } from '@/shared/hooks';

const { items, loading, hasMore, loadFirstPage, loadMore } = usePagination(
  eventosCollection,
  {
    pageSize: 10,
    mapFunction: (doc) => ({
      id: doc.id,
      ...doc.data() as Evento,
    }),
    initialConstraints: [
      where("active", "==", true),
      orderBy("createdAt", "desc")
    ],
  }
);

// Cargar primera página
useEffect(() => {
  loadFirstPage();
}, []);

// Botón "Cargar más"
<Button onPress={loadMore} disabled={!hasMore} />
```

**Beneficios:**
- ✅ Elimina código duplicado de paginación
- ✅ Manejo automático de `lastDoc` para paginación
- ✅ Estado de carga incluido
- ✅ Detección automática de "hasMore"

---

### 2. `useModal` - Manejo de Modales

Hook para simplificar el manejo de estado de modales.

**Uso:**
```typescript
import { useModal } from '@/shared/hooks';

const deleteModal = useModal<Evento>();
const editModal = useModal<Evento>();

// Abrir modal con datos
<Button onPress={() => deleteModal.open(evento)} />

// En el modal
<Modal visible={deleteModal.isOpen} onRequestClose={deleteModal.close}>
  {deleteModal.data && (
    <Text>¿Eliminar {deleteModal.data.pelicula}?</Text>
  )}
  <Button onPress={deleteModal.close}>Cancelar</Button>
</Modal>
```

**Beneficios:**
- ✅ Elimina estados booleanos repetitivos
- ✅ Manejo automático de datos del modal
- ✅ API simple y consistente

---

### 3. `useSearch` - Búsqueda con Debounce

Hook para manejar búsqueda con debounce automático.

**Uso:**
```typescript
import { useSearch } from '@/shared/hooks';

const search = useSearch({ debounceMs: 300, minLength: 2 });

// En el input
<TextInput
  value={search.query}
  onChangeText={search.setQuery}
  placeholder="Buscar..."
/>

// Usar debouncedQuery para la búsqueda real
useEffect(() => {
  if (search.debouncedQuery) {
    performSearch(search.debouncedQuery);
  }
}, [search.debouncedQuery]);

// Indicador de búsqueda
{search.isSearching && <ActivityIndicator />}
```

**Beneficios:**
- ✅ Evita búsquedas en cada tecla
- ✅ Configurable (debounce time, min length)
- ✅ Indicador de estado de búsqueda

---

### 4. `useForm` - Validación de Formularios

Hook para manejar formularios con validación.

**Uso:**
```typescript
import { useForm } from '@/shared/hooks';

const form = useForm({
  initialValues: {
    pelicula: "",
    sala: "",
  },
  validation: {
    pelicula: [
      { 
        validate: (v) => v.trim().length > 0, 
        message: "Película requerida" 
      }
    ],
    sala: [
      { 
        validate: (v) => v.trim().length > 0, 
        message: "Sala requerida" 
      }
    ],
  },
  onSubmit: async (values) => {
    await createEvento(values);
  },
});

// En el componente
<TextInput
  value={form.values.pelicula}
  onChangeText={(v) => form.setValue("pelicula", v)}
  onBlur={() => form.touch("pelicula")}
/>
{form.touched.pelicula && form.errors.pelicula && (
  <Text style={styles.error}>{form.errors.pelicula}</Text>
)}

<Button 
  onPress={form.handleSubmit} 
  disabled={form.isSubmitting}
  title={form.isSubmitting ? "Guardando..." : "Guardar"}
/>
```

**Beneficios:**
- ✅ Validación automática en onChange
- ✅ Manejo de touched/errors
- ✅ Estado de submitting incluido
- ✅ Reset automático

---

## Comparación: Antes vs Después

### Antes (sin hooks)
```typescript
// En eventos.tsx
const [eventos, setEventos] = useState<Evento[]>([]);
const [loading, setLoading] = useState(true);
const [hasMore, setHasMore] = useState(true);
const lastDocRef = useRef<QueryDocumentSnapshot | null>(null);

const loadFirstPage = async () => {
  setLoading(true);
  try {
    const qy = query(colRef, orderBy("diaHora", "asc"), qLimit(PAGE));
    const snap = await getDocs(qy);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setEventos(rows);
    lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
    setHasMore(snap.docs.length === PAGE);
  } catch (e) {
    console.error(e);
  } finally {
    setLoading(false);
  }
};

const loadMore = async () => {
  if (!hasMore || !lastDocRef.current) return;
  try {
    const qy = query(
      colRef,
      orderBy("diaHora", "asc"),
      startAfter(lastDocRef.current),
      qLimit(PAGE)
    );
    const snap = await getDocs(qy);
    const extra = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setEventos((prev) => prev.concat(extra));
    lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
    setHasMore(snap.docs.length === PAGE);
  } catch (e) {
    console.error(e);
  }
};

// ~50 líneas de código
```

### Después (con hooks)
```typescript
// En eventos.tsx
const { items: eventos, loading, hasMore, loadFirstPage, loadMore } = usePagination(
  colRef,
  {
    pageSize: 10,
    mapFunction: (d) => ({ id: d.id, ...d.data() as Evento }),
    initialConstraints: [orderBy("diaHora", "asc")],
  }
);

// ~10 líneas de código
// Reducción del 80% de código
```

---

## Impacto Esperado

### Reducción de Código
- **eventos.tsx**: ~50 líneas → ~10 líneas (paginación)
- **creditos.tsx**: ~50 líneas → ~10 líneas (paginación)
- **Modales**: ~15 líneas por modal → ~3 líneas por modal
- **Total estimado**: ~200 líneas eliminadas

### Beneficios
✅ **Menos código duplicado**  
✅ **Más fácil de testear**  
✅ **Más fácil de mantener**  
✅ **Comportamiento consistente**  
✅ **Reutilizable en nuevos features**  

---

## Notas Técnicas

- Todos los hooks siguen las reglas de React Hooks
- TypeScript completo en todos los hooks
- Documentación JSDoc en cada hook
- Ejemplos de uso incluidos

---

## Próximos Pasos

1. ✅ Hooks creados
2. ⏳ Refactorizar `eventos.tsx` para usar hooks
3. ⏳ Refactorizar `creditos.tsx` para usar hooks
4. ⏳ Refactorizar otros componentes según necesidad
