"""
Utilitários genéricos — sem regra de negócio de guindaste aqui dentro.
Qualquer coisa que dependa do significado de RN01-RN08 vai em
`project/model/regras_negocio.py`.
"""


def interpolar(pontos, x):
    """
    Interpolação linear simples.
    pontos: lista de tuplas (eixo, valor); x: ponto onde queremos o valor.
    Fora do intervalo, retorna o valor da extremidade mais próxima
    (sem extrapolar).
    """
    pontos = sorted(pontos, key=lambda p: p[0])
    if not pontos:
        return 0
    if x <= pontos[0][0]:
        return pontos[0][1]
    if x >= pontos[-1][0]:
        return pontos[-1][1]
    for (x0, y0), (x1, y1) in zip(pontos, pontos[1:]):
        if x0 <= x <= x1:
            if x1 == x0:
                return y0
            t = (x - x0) / (x1 - x0)
            return y0 + (y1 - y0) * t
    return pontos[-1][1]


def percentual(parte, total):
    """Percentual seguro (evita divisão por zero)."""
    if not total:
        return 0
    return round((parte / total) * 100, 2)


def validar_campos_obrigatorios(dados, campos):
    """Retorna a lista de nomes de campos ausentes/vazios em `dados`."""
    return [c for c in campos if dados.get(c) in (None, "")]


def formatar_kg(valor):
    """Formata um número em kg no padrão pt-BR (ex: 12.345,67 kg)."""
    if valor is None:
        return "-"
    texto = f"{valor:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"{texto} kg"


def graus_para_radianos(graus):
    import math
    return graus * math.pi / 180
