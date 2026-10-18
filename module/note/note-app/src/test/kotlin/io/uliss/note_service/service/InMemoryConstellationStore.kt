package io.uliss.note_service.service

import io.uliss.note_service.anyValue
import io.uliss.note_service.model.ConstellationEntity
import io.uliss.note_service.repository.ConstellationRepository
import org.mockito.Mockito
import java.util.UUID

/** A [ConstellationRepository] mock backed by a map, so service tests see their own writes as JPA would. */
class InMemoryConstellationStore {
    val rows = linkedMapOf<UUID, ConstellationEntity>()
    val repository: ConstellationRepository = Mockito.mock(ConstellationRepository::class.java)

    init {
        Mockito.`when`(repository.findByUserIdOrderByCreatedAtAscIdAsc(anyValue())).thenAnswer { invocation ->
            val userId = invocation.getArgument<UUID>(0)
            rows.values.filter { it.userId == userId }
        }
        Mockito.`when`(repository.saveAndFlush(anyValue<ConstellationEntity>())).thenAnswer { invocation ->
            invocation.getArgument<ConstellationEntity>(0).also { rows[it.id] = it }
        }
        Mockito.`when`(repository.deleteBranch(anyValue(), anyValue())).thenAnswer { invocation ->
            val userId = invocation.getArgument<UUID>(0)
            val id = invocation.getArgument<UUID>(1)
            val branch = branchOf(id).filter { it.userId == userId }
            branch.forEach { rows.remove(it.id) }
            branch.size
        }
    }

    fun add(entity: ConstellationEntity): ConstellationEntity = entity.also { rows[it.id] = it }

    private fun branchOf(id: UUID): List<ConstellationEntity> {
        val root = rows[id] ?: return emptyList()
        return listOf(root) + rows.values.filter { it.parentId == id }.flatMap { branchOf(it.id) }
    }
}
