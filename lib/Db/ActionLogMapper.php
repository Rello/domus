<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class ActionLogMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_action_logs', ActionLog::class);
    }

    /**
     * @throws Exception
     */
    public function findByEntity(string $userId, string $entityType, int $entityId, ?int $limit = null, int $offset = 0): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->eq('entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT)))
            ->orderBy('created_at', 'DESC')
            ->addOrderBy('id', 'DESC');

        if ($limit !== null) {
            $qb->setMaxResults($limit);
            if ($offset > 0) {
                $qb->setFirstResult($offset);
            }
        }

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findByEntities(string $userId, array $entities, ?int $limit = null, int $offset = 0): array {
        if ($entities === []) {
            return [];
        }

        $qb = $this->db->getQueryBuilder();
        $conditions = [];

        foreach ($entities as $entity) {
            $entityType = (string)($entity['entityType'] ?? '');
            $entityId = isset($entity['entityId']) ? (int)$entity['entityId'] : 0;
            if ($entityType === '' || $entityId <= 0) {
                continue;
            }

            $conditions[] = $qb->expr()->andX(
                $qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)),
                $qb->expr()->eq('entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT))
            );
        }

        if ($conditions === []) {
            return [];
        }

        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere(call_user_func_array([$qb->expr(), 'orX'], $conditions))
            ->orderBy('created_at', 'DESC')
            ->addOrderBy('id', 'DESC');

        if ($limit !== null) {
            $qb->setMaxResults($limit);
            if ($offset > 0) {
                $qb->setFirstResult($offset);
            }
        }

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findForUser(int $id, string $userId): ?ActionLog {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->setMaxResults(1);

        return $this->findEntity($qb);
    }

    /**
     * @throws Exception
     */
    public function deleteForEntity(string $userId, string $entityType, int $entityId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->eq('entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT)));

        $qb->executeStatement();
    }

    /**
     * @throws Exception
     */
    public function deleteForLinkedEntity(string $userId, string $entityType, int $entityId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('linked_entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->eq('linked_entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT)));

        $qb->executeStatement();
    }

    /**
     * @throws Exception
     */
    public function countAffectedByEntity(string $userId, string $entityType, int $entityId): int {
        $qb = $this->db->getQueryBuilder();
        $qb->selectAlias($qb->createFunction('COUNT(DISTINCT id)'), 'amount')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere(
                $qb->expr()->orX(
                    $qb->expr()->andX(
                        $qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)),
                        $qb->expr()->eq('entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT))
                    ),
                    $qb->expr()->andX(
                        $qb->expr()->eq('linked_entity_type', $qb->createNamedParameter($entityType)),
                        $qb->expr()->eq('linked_entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT))
                    )
                )
            );

        return (int)$qb->executeQuery()->fetchOne();
    }
}
