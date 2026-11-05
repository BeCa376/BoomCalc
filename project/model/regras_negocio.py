"""
Regras de negócio do içamento — RN01 a RN08.

Fica em `model` (e não em `functions`) porque é lógica de domínio,
amarrada ao significado de Guindaste/Simulação/Resultado — diferente
das funções utilitárias genéricas de `project/functions`.
"""
from project.functions import utils


def quadrante_por_giro(angulo_giro_graus):
    """Giro 0°-16° = área frontal; acima disso = lateral/traseira."""
    return "frontal" if angulo_giro_graus <= 16 else "lateral_traseira"


def capacidade_disponivel(linhas_tabela, angulo=None, raio=None):
    """
    linhas_tabela: lista de dicts com angulo_graus / raio_m / capacidade_kg,
    já filtrados por guindaste + quadrante + comprimento de lança mais
    próximo (RN06: cada modelo tem sua própria tabela).

    Usa ângulo se a tabela tiver angulo_graus preenchido (ex: TM130),
    senão usa raio (ex: MD300L).
    """
    if not linhas_tabela:
        return 0
    usa_angulo = linhas_tabela[0].get("angulo_graus") is not None
    if usa_angulo:
        pontos = [(l["angulo_graus"], l["capacidade_kg"]) for l in linhas_tabela]
        return utils.interpolar(pontos, angulo)
    pontos = [(l["raio_m"], l["capacidade_kg"]) for l in linhas_tabela]
    # Além do maior raio tabelado não existe capacidade garantida: não
    # extrapolar (a capacidade cai com o raio, repetir a ponta seria inseguro).
    if raio is not None and raio > max(p[0] for p in pontos):
        return 0
    return utils.interpolar(pontos, raio)


def avaliar_operacao(capacidade_kg, peso_carga, massa_lingada, massa_cabo,
                      usa_balancim, massa_balancim, velocidade_vento=None,
                      limite_vento_ms=12.5, limite_percentual_alerta=80,
                      capacidade_nominal_kg=None):
    """Aplica RN01-RN04 e RN08 e devolve o dict pronto para virar Resultado."""
    erros = []
    if peso_carga is None or peso_carga <= 0:
        erros.append("RN01: o peso da carga deve ser maior que zero.")

    carga_total = (peso_carga or 0) + (massa_lingada or 0) + (massa_cabo or 0)
    if usa_balancim:
        carga_total += (massa_balancim or 0)

    if capacidade_nominal_kg and carga_total > capacidade_nominal_kg:
        erros.append(
            f"RN01: carga total ({carga_total:.0f} kg) acima da capacidade nominal "
            f"do guindaste ({capacidade_nominal_kg:.0f} kg) — confira o peso informado."
        )

    if not capacidade_kg or capacidade_kg <= 0:
        erros.append(
            "RN05: sem capacidade tabelada para este ponto (raio fora da tabela "
            "ou sem dados para este quadrante/comprimento de lança) — operação "
            "não pode ser validada."
        )

    alerta_vento = False
    if velocidade_vento is not None and velocidade_vento > limite_vento_ms:
        alerta_vento = True
        erros.append(
            f"RN08: velocidade do vento ({velocidade_vento} m/s) acima do limite "
            f"permitido ({limite_vento_ms} m/s)."
        )

    if erros:
        return {
            "status": "inseguro",
            "carga_total_kg": carga_total,
            "capacidade_disponivel_kg": capacidade_kg,
            "percentual_utilizado": utils.percentual(carga_total, capacidade_kg),
            "alerta_vento": alerta_vento,
            "mensagem": " | ".join(erros),
        }

    percentual = utils.percentual(carga_total, capacidade_kg)
    if percentual <= limite_percentual_alerta:
        status, mensagem = "seguro", "Operação dentro da capacidade da tabela."
    elif percentual <= 100:
        status = "proximo_limite"
        mensagem = "Operação próxima do limite de capacidade — revisar antes de prosseguir."
    else:
        status = "inseguro"
        mensagem = "RN04: carga ultrapassa a capacidade máxima disponível para este raio/ângulo."

    return {
        "status": status,
        "carga_total_kg": carga_total,
        "capacidade_disponivel_kg": capacidade_kg,
        "percentual_utilizado": percentual,
        "alerta_vento": alerta_vento,
        "mensagem": mensagem,
    }
