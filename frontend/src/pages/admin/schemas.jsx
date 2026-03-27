// ============================================================
// pages/admin/schemas.jsx
// ============================================================
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { schemasAPI } from '../../utils/api';
import { useProjectStore } from '../../hooks/useAuth';
import FieldSchemaManager from '../../components/admin/FieldSchemaManager';
import { PageLoader, EmptyState } from '../../components/shared';
import { Layers } from 'lucide-react';

export default function SchemasPage() {
  const { currentProject } = useProjectStore();
  const qc = useQueryClient();

  const { data: schemas = [], isLoading } = useQuery({
    queryKey: ['schemas', currentProject?.id],
    queryFn: () => schemasAPI.list(currentProject.id).then(r => r.data),
    enabled: !!currentProject?.id,
  });

  if (!currentProject) return (
    <div className="p-8">
      <EmptyState icon={Layers} title="Sin proyecto activo"
        description="Seleccione un proyecto primero." />
    </div>
  );

  if (isLoading) return <PageLoader />;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <FieldSchemaManager
        schemas={schemas}
        projectId={currentProject.id}
        onRefresh={() => qc.invalidateQueries({ queryKey: ['schemas', currentProject.id] })}
      />
    </div>
  );
}
