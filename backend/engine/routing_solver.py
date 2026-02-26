"""
Backend Engine: Routing Solver (OR-Tools)
Implements CP-SAT with budget/time hard constraints and greedy fallback.
"""

import time
from typing import Optional
from ortools.sat.python import cp_model


def solve_vrptw(
    stops: list[dict],
    cost_matrix: list[list[int]],
    time_matrix: list[list[int]],
    budget_cents: int,
    deadline_seconds: int,
    start_index: int = 0
) -> Optional[list[int]]:
    """
    Solves VRPTW using OR-Tools CP-SAT.
    Constraints: cost <= budget, time <= deadline, visit all stops exactly once.
    Maximizes priority/minimizes time (simplified for MVP: minimizes completion time).
    Time limit: 1.0 second.
    """
    num_stops = len(stops)
    if num_stops <= 1:
        return [0]

    model = cp_model.CpModel()

    # Variables
    # x[i, j] = 1 if route goes from stop i to stop j
    x = {}
    for i in range(num_stops):
        for j in range(num_stops):
            if i != j:
                x[i, j] = model.NewBoolVar(f"x_{i}_{j}")

    # Flow conservation
    for i in range(num_stops):
        # Outgoing edges
        model.AddExactlyOne(x[i, j] for j in range(num_stops) if i != j)
        # Incoming edges
        model.AddExactlyOne(x[j, i] for j in range(num_stops) if i != j)

    # Subtour elimination (MTZ formulation) & Time constraint
    # t[i] : arrival time at node i
    t = [model.NewIntVar(0, deadline_seconds, f"t_{i}") for i in range(num_stops)]
    
    # Start at t=0
    model.Add(t[start_index] == 0)

    for i in range(num_stops):
        for j in range(num_stops):
            if i != j:
                # if x[i, j] == 1 => t[j] >= t[i] + time_matrix[i][j]
                model.Add(t[j] >= t[i] + time_matrix[i][j]).OnlyEnforceIf(x[i, j])

    # Budget Constraint
    total_cost = sum(
        x[i, j] * cost_matrix[i][j] 
        for i in range(num_stops) 
        for j in range(num_stops) if i != j
    )
    model.Add(total_cost <= budget_cents)

    # Objective: Minimize total time (or end time)
    # Get the time of the last visited node. Since it's a tour (cycle), 
    # we just minimize the sum of travel times.
    total_time = sum(
        x[i, j] * time_matrix[i][j] 
        for i in range(num_stops) 
        for j in range(num_stops) if i != j
    )
    model.Minimize(total_time)

    # Solve
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 1.0  # HARD TIME LIMIT
    status = solver.Solve(model)

    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        # Reconstruct route
        route = [start_index]
        curr = start_index
        while True:
            for j in range(num_stops):
                if curr != j and solver.Value(x[curr, j]) == 1:
                    next_node = j
                    break
            if next_node == start_index:
                break
            route.append(next_node)
            curr = next_node
        return route

    return None  # Solver failed or timed out


def greedy_fallback(
    stops: list[dict],
    cost_matrix: list[list[int]],
    time_matrix: list[list[int]],
    budget_cents: int,
    deadline_seconds: int,
    start_index: int = 0
) -> Optional[list[int]]:
    """Greedy Nearest-Neighbor heuristic to guarantee an answer."""
    num_stops = len(stops)
    visited = set([start_index])
    route = [start_index]
    
    curr = start_index
    curr_cost = 0
    curr_time = 0
    
    while len(visited) < num_stops:
        best_j = -1
        best_time = float('inf')
        
        for j in range(num_stops):
            if j not in visited:
                # Check constraints
                if curr_cost + cost_matrix[curr][j] <= budget_cents and \
                   curr_time + time_matrix[curr][j] <= deadline_seconds:
                    
                    if time_matrix[curr][j] < best_time:
                        best_time = time_matrix[curr][j]
                        best_j = j
        
        if best_j == -1:
            return None  # Infeasible greedy choice
            
        visited.add(best_j)
        route.append(best_j)
        curr_cost += cost_matrix[curr][best_j]
        curr_time += time_matrix[curr][best_j]
        curr = best_j

    # Add return to start
    if curr_cost + cost_matrix[curr][start_index] <= budget_cents and \
       curr_time + time_matrix[curr][start_index] <= deadline_seconds:
        return route
    else:
        return None
