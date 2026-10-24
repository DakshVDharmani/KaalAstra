import sys
from types import SimpleNamespace
sys.path.insert(0, 'scripts')
import torch
from risk_model import RiskCollator, binary_loss, score
class Toy(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.embedding = torch.nn.Embedding(20, 8)
        self.head = torch.nn.Linear(8, 20)
        self.device = torch.device('cpu')
    def forward(self, input_ids, attention_mask, use_cache, logits_to_keep):
        assert use_cache is False and logits_to_keep == 1
        return SimpleNamespace(logits=self.head(self.embedding(input_ids[:, -1:])))
model = Toy()
batch = RiskCollator(0)([{'input_ids': [2, 3], 'labels': 1}, {'input_ids': [4], 'labels': 0}])
loss, result = binary_loss(model, batch, [5, 6])
loss.backward()
assert result['logits'].shape == (2, 2)
assert model.head.weight.grad.abs().sum() > 0
assert batch['attention_mask'].tolist() == [[1, 1], [0, 1]]
assert 0 <= score(model, [2, 3], [5, 6]) <= 1
print('CPU binary loss, gradients, left padding, and inference passed')
