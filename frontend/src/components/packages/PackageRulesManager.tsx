import { Package, PackageDeconstructionRule } from '@/types/packages';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Plus, Trash2, Edit, ToggleLeft, ToggleRight } from 'lucide-react';
import { useState } from 'react';

interface PackageRulesManagerProps {
  rules: PackageDeconstructionRule[];
  onRulesChange: (rules: PackageDeconstructionRule[]) => void;
  package: Package;
}

export function PackageRulesManager({ rules, onRulesChange, package: pkg }: PackageRulesManagerProps) {
  const [editingRule, setEditingRule] = useState<PackageDeconstructionRule | null>(null);

  const addNewRule = () => {
    const newRule: PackageDeconstructionRule = {
      id: `temp-${Date.now()}`,
      package_id: pkg.id,
      rule_type: 'dependency',
      rule_conditions: {},
      rule_actions: {},
      priority: 1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    onRulesChange([...rules, newRule]);
    setEditingRule(newRule);
  };

  const deleteRule = (ruleId: string) => {
    onRulesChange(rules.filter(rule => rule.id !== ruleId));
  };

  const toggleRuleActive = (ruleId: string) => {
    onRulesChange(rules.map(rule =>
      rule.id === ruleId ? { ...rule, is_active: !rule.is_active } : rule
    ));
  };

  const updateRule = (updatedRule: PackageDeconstructionRule) => {
    onRulesChange(rules.map(rule =>
      rule.id === updatedRule.id ? updatedRule : rule
    ));
    setEditingRule(null);
  };

  const getRuleTypeColor = (type: string) => {
    const colors = {
      dependency: 'blue',
      timing: 'green',
      resource: 'purple',
      pricing: 'orange',
      substitution: 'red'
    };
    return colors[type as keyof typeof colors] || 'gray';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Deconstruction Rules</h2>
          <p className="text-gray-600">Define rules for package customization and validation</p>
        </div>
        <Button onClick={addNewRule}>
          <Plus size={16} className="mr-2" />
          Add Rule
        </Button>
      </div>

      {/* Rules List */}
      <div className="space-y-4">
        {rules.map(rule => (
          <Card key={rule.id} className={!rule.is_active ? 'opacity-60' : ''}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant={getRuleTypeColor(rule.rule_type) as any}>
                      {rule.rule_type}
                    </Badge>
                    <span className="font-medium">Priority: {rule.priority}</span>
                    <button
                      onClick={() => toggleRuleActive(rule.id)}
                      className="flex items-center gap-1 text-sm text-gray-600"
                    >
                      {rule.is_active ? (
                        <ToggleRight size={16} className="text-green-600" />
                      ) : (
                        <ToggleLeft size={16} className="text-gray-400" />
                      )}
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Conditions:</span>
                      <pre className="text-xs bg-gray-50 p-2 rounded mt-1">
                        {JSON.stringify(rule.rule_conditions, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <span className="font-medium">Actions:</span>
                      <pre className="text-xs bg-gray-50 p-2 rounded mt-1">
                        {JSON.stringify(rule.rule_actions, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingRule(rule)}
                  >
                    <Edit size={14} />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteRule(rule.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {rules.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              <p>No rules defined yet.</p>
              <p className="text-sm mt-1">
                Add rules to control how this package can be customized and validated.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Rule Editor Modal */}
      {editingRule && (
        <RuleEditor
          rule={editingRule}
          onSave={updateRule}
          onCancel={() => setEditingRule(null)}
        />
      )}
    </div>
  );
}

// Simplified Rule Editor Component
function RuleEditor({ 
  rule, 
  onSave, 
  onCancel 
}: { 
  rule: PackageDeconstructionRule;
  onSave: (rule: PackageDeconstructionRule) => void;
  onCancel: () => void;
}) {
  const [editedRule, setEditedRule] = useState(rule);

  const handleSave = () => {
    onSave(editedRule);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <h3 className="text-lg font-semibold">Edit Rule</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Rule type selection */}
          <div>
            <label className="block text-sm font-medium mb-1">Rule Type</label>
            <select
              value={editedRule.rule_type}
              onChange={(e) => setEditedRule({
                ...editedRule,
                rule_type: e.target.value as any
              })}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="dependency">Dependency</option>
              <option value="timing">Timing</option>
              <option value="resource">Resource</option>
              <option value="pricing">Pricing</option>
              <option value="substitution">Substitution</option>
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium mb-1">Priority</label>
            <input
              type="number"
              min="1"
              max="10"
              value={editedRule.priority}
              onChange={(e) => setEditedRule({
                ...editedRule,
                priority: parseInt(e.target.value)
              })}
              className="w-20 border rounded-lg px-3 py-2"
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={editedRule.is_active}
              onChange={(e) => setEditedRule({
                ...editedRule,
                is_active: e.target.checked
              })}
            />
            <label htmlFor="is_active" className="text-sm font-medium">
              Active Rule
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Rule
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
